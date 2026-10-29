"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { runAction, BusinessError, type ActionState } from "@/server/action";
import { buildRecipients, parseTarget } from "@/server/services/messages";
import { PROVIDERS } from "@/server/messaging";

/** Prépare les messages (statut PRÉPARÉ). Les textes sont recalculés côté serveur ; rien n'est envoyé automatiquement. */
export async function prepareMessages(_: ActionState, fd: FormData): Promise<ActionState> {
  let batch = "";
  const res = await runAction(async () => {
    const user = await requirePermission("messages.write");
    const template = await db.messageTemplate.findUnique({ where: { id: String(fd.get("templateId") ?? "") } });
    if (!template?.active) throw new BusinessError("Modèle introuvable ou désactivé.");
    const target = parseTarget(String(fd.get("target") ?? "") || undefined, String(fd.get("ids") ?? "") || undefined);
    if (!target) throw new BusinessError("Destinataires non définis.");
    const extra = String(fd.get("extra") ?? "").trim().slice(0, 500);
    const keep = new Set(fd.getAll("keys").map(String));
    const { recipients } = await buildRecipients(template.body, template.audience, target, extra);
    const chosen = recipients.filter((r) => keep.has(r.key));
    if (!chosen.length) throw new BusinessError("Cochez au moins un destinataire.");
    batch = randomUUID();
    await db.message.createMany({
      data: chosen.map((r) => ({
        batchId: batch, templateId: template.id, audience: template.audience, channel: "MANUEL" as const, recipientName: r.name, recipientPhone: r.phone,
        studentId: r.studentId, guardianId: r.guardianId, teacherId: r.teacherId, body: r.body, createdById: user.id,
      })),
    });
    await audit(user.id, "messages.prepare", "Message", batch, { template: template.code, count: chosen.length });
  });
  if (res?.ok) redirect(`/messages?batch=${batch}`);
  return res;
}

/** L'utilisateur confirme avoir envoyé lui-même les messages (canal manuel). */
export async function markSent(fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => {
    const user = await requirePermission("messages.write");
    const ids = String(fd.get("ids") ?? "").split(",").filter(Boolean);
    if (!ids.length) throw new BusinessError("Aucun message sélectionné.");
    const msgs = await db.message.findMany({ where: { id: { in: ids }, status: "PREPARE" } });
    let sent = 0;
    for (const m of msgs) {
      const provider = PROVIDERS[m.channel];
      const r = await provider.send({ to: m.recipientPhone ?? "", body: m.body });
      if (r.ok) {
        await db.message.update({ where: { id: m.id }, data: { status: "ENVOYE", sentAt: new Date(), sentById: user.id } });
        sent++;
      } else {
        await db.message.update({ where: { id: m.id }, data: { status: "ECHEC", error: r.error } });
      }
    }
    await audit(user.id, "messages.sent", "Message", null, { count: sent, requested: ids.length });
    return `${sent} message(s) marqué(s) comme envoyé(s).`;
  });
  revalidatePath("/messages");
  return res;
}

export async function cancelMessages(fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => {
    const user = await requirePermission("messages.write");
    const ids = String(fd.get("ids") ?? "").split(",").filter(Boolean);
    const r = await db.message.updateMany({ where: { id: { in: ids }, status: "PREPARE" }, data: { status: "ANNULE", error: String(fd.get("reason") ?? "") || null } });
    await audit(user.id, "messages.cancel", "Message", null, { count: r.count });
    return `${r.count} message(s) annulé(s).`;
  });
  revalidatePath("/messages");
  return res;
}
