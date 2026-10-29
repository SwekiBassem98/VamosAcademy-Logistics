import { todayISO } from "./format";

// Logique de facturation pure (sans accès base) — testée dans tests/billing.test.ts

export type InvoiceStatus = "PAYEE" | "PARTIELLE" | "IMPAYEE" | "EN_RETARD";

export interface OpenInvoice {
  id: string;
  amount: number;
  paid: number;
  dueDate: Date;
}

/** Mois facturables d'une inscription : mois de l'année ≥ mois d'entrée et ≤ mois de sortie. */
export function billableMonths(billingMonths: string[], startPeriod: string, endPeriod?: string | null): string[] {
  return billingMonths.filter((m) => m >= startPeriod && (!endPeriod || m <= endPeriod)).sort();
}

/** Date limite d'une échéance mensuelle ; jamais antérieure à la date d'entrée (`notBefore`). */
export function dueDateFor(period: string, dueDay: number, notBefore?: Date): Date {
  const [y, m] = period.split("-").map(Number);
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const due = new Date(Date.UTC(y, m - 1, Math.min(dueDay, lastDay), 12));
  return notBefore && notBefore > due ? notBefore : due;
}

/**
 * Répartit un paiement sur les échéances ouvertes, de la plus ancienne à la plus récente (FIFO).
 * Si `targetIds` est fourni, seules ces échéances sont réglées (dans l'ordre chronologique).
 * Lève une erreur si le montant dépasse le reste dû.
 */
export function allocateFIFO(
  invoices: OpenInvoice[],
  amount: number,
  targetIds?: string[],
): { invoiceId: string; amount: number }[] {
  if (!Number.isInteger(amount) || amount <= 0) throw new Error("Montant invalide");
  const pool = invoices
    .filter((i) => i.amount - i.paid > 0 && (!targetIds?.length || targetIds.includes(i.id)))
    .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());
  const outstanding = pool.reduce((s, i) => s + (i.amount - i.paid), 0);
  if (amount > outstanding) {
    throw new Error("Le montant dépasse le reste à payer des échéances sélectionnées");
  }
  const out: { invoiceId: string; amount: number }[] = [];
  let left = amount;
  for (const inv of pool) {
    if (left === 0) break;
    const part = Math.min(left, inv.amount - inv.paid);
    out.push({ invoiceId: inv.id, amount: part });
    left -= part;
  }
  return out;
}

/** En retard seulement une fois le jour d'échéance écoulé (heure de Tunis). */
export function isLate(dueDate: Date, now: Date = new Date()): boolean {
  return todayISO(now) > todayISO(dueDate);
}

export function invoiceStatus(amount: number, paid: number, dueDate: Date, now: Date = new Date()): InvoiceStatus {
  if (paid >= amount) return "PAYEE";
  if (isLate(dueDate, now)) return "EN_RETARD";
  return paid > 0 ? "PARTIELLE" : "IMPAYEE";
}

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  PAYEE: "Payée",
  PARTIELLE: "Partielle",
  IMPAYEE: "À payer",
  EN_RETARD: "En retard",
};

/** Applique une remise : pourcentage (0-100) ou montant fixe en millimes. */
export function applyDiscount(fee: number, discount: { percent?: number; amount?: number }): number {
  let v = fee;
  if (discount.percent) v = Math.round((v * (100 - discount.percent)) / 100);
  if (discount.amount) v -= discount.amount;
  return Math.max(0, v);
}

/** Mois de septembre à juin pour une année scolaire démarrant `startYear`. */
export function defaultBillingMonths(startYear: number): string[] {
  const months: string[] = [];
  for (let i = 0; i < 10; i++) {
    const m = ((8 + i) % 12) + 1;
    const y = m >= 9 ? startYear : startYear + 1;
    months.push(`${y}-${String(m).padStart(2, "0")}`);
  }
  return months;
}
