import "server-only";
import { db } from "./db";

/** Moyens de paiement configurés (actifs par défaut), dans l'ordre d'affichage. */
export async function paymentModes(includeInactive = false) {
  return db.paymentMode.findMany({ where: includeInactive ? {} : { active: true }, orderBy: [{ order: "asc" }, { label: "asc" }] });
}

export function modeOptions(modes: { id: string; label: string; requiresReference: boolean }[]) {
  return modes.map((m) => ({ value: m.id, label: m.requiresReference ? `${m.label} (référence requise)` : m.label }));
}
