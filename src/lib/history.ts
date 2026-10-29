// Historique des modifications : différences champ par champ, stockées dans AuditLog.details

export type Change = { field: string; from: string | number | boolean | null; to: string | number | boolean | null };

function norm(v: unknown): string | number | boolean | null {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (v === undefined || v === null || v === "") return null;
  return typeof v === "object" ? JSON.stringify(v) : (v as string | number | boolean | null);
}

/** Liste les champs dont la valeur change entre `before` et `after` (seules les clés de `after` sont comparées). */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>): Change[] {
  const out: Change[] = [];
  for (const k of Object.keys(after)) {
    const a = norm(before[k]);
    const b = norm(after[k]);
    if (JSON.stringify(a) !== JSON.stringify(b)) out.push({ field: k, from: a, to: b });
  }
  return out;
}

export const FIELD_LABELS: Record<string, string> = {
  firstName: "Prénom", lastName: "Nom", fullNameAr: "Nom arabe", birthDate: "Naissance", gender: "Sexe",
  school: "Établissement", className: "Classe", levelId: "Niveau", phone: "Téléphone", address: "Adresse",
  medicalNotes: "Remarques médicales", notes: "Remarques", status: "Statut",
};

// Détection de doublons probables à la création d'un élève
export function normalizeName(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z؀-ۿ]+/g, " ").trim();
}

export function isProbableDuplicate(
  a: { firstName: string; lastName: string; birthDate?: Date | null },
  b: { firstName: string; lastName: string; birthDate?: Date | null },
): boolean {
  if (normalizeName(a.firstName) !== normalizeName(b.firstName)) return false;
  if (normalizeName(a.lastName) !== normalizeName(b.lastName)) return false;
  if (a.birthDate && b.birthDate) return a.birthDate.toISOString().slice(0, 10) === b.birthDate.toISOString().slice(0, 10);
  return true; // même nom complet, date inconnue d'un côté : à confirmer
}
