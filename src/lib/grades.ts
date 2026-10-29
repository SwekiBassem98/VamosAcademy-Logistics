// Calcul des moyennes — testé dans tests/unit.test.ts

export type GradeInput = { score: number | null; maxScore: number; coefficient: number };

/** Moyenne pondérée ramenée sur 20 ; les notes vides (absent/non noté) sont ignorées. null si aucune note. */
export function weightedAverage(grades: GradeInput[]): number | null {
  let sum = 0;
  let coef = 0;
  for (const g of grades) {
    if (g.score == null || g.maxScore <= 0) continue;
    sum += (g.score / g.maxScore) * 20 * g.coefficient;
    coef += g.coefficient;
  }
  return coef ? Math.round((sum / coef) * 100) / 100 : null;
}

/** "14,25" ou "14.5" → 14.25 ; "" → null ; hors barème → erreur. */
export function parseScore(input: string, maxScore: number): number | null {
  const s = input.trim().replace(",", ".");
  if (!s) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error(`Note invalide : « ${input} »`);
  const v = Number(s);
  if (v > maxScore) throw new Error(`Note ${input} supérieure au barème (${maxScore})`);
  return v;
}

export function formatScore(v: number | null | undefined): string {
  return v == null ? "—" : v.toLocaleString("fr-FR", { maximumFractionDigits: 2 });
}

export const KIND_LABEL = { DEVOIR: "Devoir", TEST: "Test", EXAMEN_BLANC: "Examen blanc", ORAL: "Oral" } as const;
