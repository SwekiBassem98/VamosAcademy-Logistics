"use server";

import { revalidatePath } from "next/cache";
import { requirePermission } from "@/server/auth";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { runAction, BusinessError, type ActionState } from "@/server/action";
import { resolveFee } from "@/lib/billing";

/** Aligne des groupes sur la grille. Les inscriptions existantes gardent leur tarif : seules les nouvelles sont concernées. */
async function applyGrid(where: { id?: string; schoolYearId?: string }, userId: string) {
  const groups = await db.group.findMany({ where: { ...where, active: true }, include: { level: true } });
  let changed = 0;
  for (const g of groups) {
    const rules = await db.feeRule.findMany({ where: { schoolYearId: g.schoolYearId } });
    const rule = resolveFee(rules, { cycleId: g.level.cycleId, levelId: g.levelId, subjectId: g.subjectId });
    if (!rule || (rule.monthlyFee === g.monthlyFee && rule.registrationFee === g.registrationFee)) continue;
    await db.group.update({ where: { id: g.id }, data: { monthlyFee: rule.monthlyFee, registrationFee: rule.registrationFee } });
    await audit(userId, "group.fee.apply", "Group", g.id, {
      name: g.name, from: { monthlyFee: g.monthlyFee, registrationFee: g.registrationFee }, to: { monthlyFee: rule.monthlyFee, registrationFee: rule.registrationFee },
    });
    changed++;
  }
  return changed;
}

export async function applyGridToGroup(id: string): Promise<ActionState> {
  const res = await runAction(async () => {
    const user = await requirePermission("settings.manage");
    if (!(await applyGrid({ id }, user.id))) throw new BusinessError("Ce groupe est déjà conforme à la grille ou aucun tarif ne s'y applique.");
    return "Tarif du groupe aligné sur la grille. Les inscriptions existantes ne changent pas.";
  });
  revalidatePath("/tarifs");
  return res;
}

export async function applyGridToYear(schoolYearId: string): Promise<ActionState> {
  const res = await runAction(async () => {
    const user = await requirePermission("settings.manage");
    const n = await applyGrid({ schoolYearId }, user.id);
    return `${n} groupe(s) aligné(s) sur la grille. Les inscriptions existantes ne changent pas.`;
  });
  revalidatePath("/tarifs");
  return res;
}
