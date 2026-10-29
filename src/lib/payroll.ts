// Calcul des rémunérations enseignants — testé dans tests/unit.test.ts. Montants en millimes (entiers).

export type PayModeT = "HORAIRE" | "MENSUEL" | "POURCENTAGE" | "PAR_SEANCE";

export const PAY_MODE_LABEL: Record<PayModeT, string> = {
  HORAIRE: "À l'heure", MENSUEL: "Forfait mensuel", POURCENTAGE: "% des mensualités encaissées", PAR_SEANCE: "Par séance",
};

export type PayInput = {
  minutes: number; // durée totale des séances tenues
  sessions: number; // nombre de séances tenues
  collected: number; // mensualités encaissées sur ses groupes (millimes)
};

/** Retourne la quantité de référence et le montant calculé selon la modalité. */
export function computeTeacherPay(mode: PayModeT, rate: number, input: PayInput): { quantity: number; amount: number } {
  switch (mode) {
    case "HORAIRE": // rate = millimes / heure ; arrondi au millime
      return { quantity: input.minutes, amount: Math.round((rate * input.minutes) / 60) };
    case "PAR_SEANCE":
      return { quantity: input.sessions, amount: rate * input.sessions };
    case "POURCENTAGE": // rate = %
      return { quantity: input.collected, amount: Math.round((input.collected * rate) / 100) };
    case "MENSUEL":
      return { quantity: 1, amount: rate };
  }
}

export const PAY_STATUS_LABEL = { BROUILLON: "Brouillon", VALIDE: "Validée", PAYE: "Payée", ANNULE: "Annulée" } as const;
