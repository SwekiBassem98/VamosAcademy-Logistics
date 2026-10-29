"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { runAction, BusinessError, type ActionState } from "@/server/action";
import { draftPay, validatePay, markPayPaid, cancelPay as cancel } from "@/server/services/payroll";
import { formToObject } from "@/lib/validation";
import { parseMoney } from "@/lib/format";

const period = z.string().regex(/^\d{4}-\d{2}$/, "Mois invalide");

/** Calcule les brouillons du mois pour tous les enseignants actifs (les paies validées/payées ne sont pas touchées). */
export async function computeAll(p: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("payroll.manage");
    const per = period.parse(p);
    const teachers = await db.teacher.findMany({ where: { active: true } });
    let done = 0, skipped = 0;
    for (const t of teachers) {
      try { await draftPay(t.id, per, user.id); done++; } catch (e) { if (e instanceof BusinessError) skipped++; else throw e; }
    }
    revalidatePath("/payroll");
    return `${done} paie(s) calculée(s)${skipped ? `, ${skipped} déjà validée(s) ou payée(s) non modifiée(s)` : ""}.`;
  });
}

export async function computeOne(teacherId: string, p: string): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("payroll.manage");
    await draftPay(teacherId, period.parse(p), user.id);
    revalidatePath("/payroll");
    return "Paie recalculée.";
  });
}

export async function validate(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("payroll.manage");
    const raw = String(fd.get("adjustment") ?? "").trim();
    const negative = raw.startsWith("-");
    const parsed = raw ? parseMoney(raw.replace(/^[-+]/, "")) : 0;
    if (parsed === null) throw new BusinessError("Ajustement invalide (ex. -15,000 ou 20).");
    const note = String(fd.get("note") ?? "").trim() || null;
    await validatePay(id, negative ? -parsed : parsed, note, user.id);
    revalidatePath("/payroll");
    return "Paie validée.";
  });
}

export async function pay(id: string, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requirePermission("payroll.manage");
    const v = z.object({ modeId: z.string().min(1, "Moyen obligatoire"), paidAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date invalide"), reference: z.string().optional() }).parse(formToObject(fd));
    await markPayPaid(id, { ...v, reference: v.reference || null }, user.id);
    revalidatePath("/payroll");
    return "Paiement enregistré et dépense créée.";
  });
}

export async function cancelPayroll(id: string, fd: FormData): Promise<ActionState> {
  const res = await runAction(async () => {
    const user = await requirePermission("payroll.manage");
    return cancel(id, String(fd.get("reason") ?? ""), user.id);
  });
  revalidatePath("/payroll");
  return res;
}
