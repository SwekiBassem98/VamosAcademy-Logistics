"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { visibleWhere } from "@/server/services/notifications";
import { runAction, BusinessError, type ActionState } from "@/server/action";

/** Actions groupées sur les notifications ; seules celles visibles par l'utilisateur sont modifiées. */
export async function updateNotifications(fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => {
    const user = await requireUser();
    const ids = String(fd.get("ids") ?? "").split(",").filter(Boolean);
    const status = String(fd.get("status") ?? "");
    if (!ids.length) throw new BusinessError("Aucune notification sélectionnée.");
    if (!["LUE", "TRAITEE", "NOUVELLE"].includes(status)) throw new BusinessError("Statut invalide.");
    const note = String(fd.get("reason") ?? "").trim() || null;
    const r = await db.notification.updateMany({
      where: { id: { in: ids }, ...visibleWhere(user) },
      data: status === "TRAITEE"
        ? { status: "TRAITEE", handledAt: new Date(), handledById: user.id, handledNote: note, readAt: new Date() }
        : status === "LUE" ? { status: "LUE", readAt: new Date() } : { status: "NOUVELLE", readAt: null, handledAt: null, handledById: null, handledNote: null },
    });
    await audit(user.id, "notification.update", "Notification", null, { count: r.count, status, note });
    return `${r.count} notification(s) mise(s) à jour.`;
  });
  revalidatePath("/", "layout");
  return res;
}
