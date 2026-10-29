import "server-only";
import { db } from "../db";
import { resolveFee } from "@/lib/billing";

/** Tarif suggéré par la grille pour un groupe (année, niveau, matière). */
export async function suggestedFee(schoolYearId: string, levelId: string, subjectId: string) {
  const level = await db.level.findUnique({ where: { id: levelId } });
  if (!level) return null;
  const rules = await db.feeRule.findMany({ where: { schoolYearId } });
  return resolveFee(rules, { cycleId: level.cycleId, levelId, subjectId });
}
