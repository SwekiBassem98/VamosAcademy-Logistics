import "server-only";
import type { PaymentPlan, Prisma } from "@prisma/client";
import { db, type Tx } from "../db";
import { audit } from "../audit";
import { BusinessError } from "../action";
import { notify } from "./notifications";
import { allocateFIFO, billableMonths, invoiceStatus, isLate, periodSpan, planInvoices } from "@/lib/billing";
import { formatMoney, periodOf, parseDay, todayISO } from "@/lib/format";

/** Échéances « vivantes » : jamais supprimées, mais annulées le cas échéant. */
export const LIVE_INVOICE = { cancelledAt: null } satisfies Prisma.InvoiceWhereInput;
/** Allocations comptées : celles des paiements non annulés. */
const LIVE_ALLOC = { where: { payment: { cancelledAt: null } } } as const;

export async function getActiveYear() {
  const y = await db.schoolYear.findFirst({ where: { active: true } });
  if (!y) throw new BusinessError("Aucune année scolaire active. Configurez-la dans Paramètres.");
  return y;
}

/**
 * Crée les échéances manquantes d'une inscription selon son échéancier (idempotent) :
 * seuls les mois facturables non couverts par une échéance active sont planifiés.
 */
export async function syncInvoicesForEnrollment(enrollmentId: string, tx: Tx | typeof db = db): Promise<number> {
  const e = await tx.enrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    include: { group: { include: { schoolYear: true } }, invoices: { where: { ...LIVE_INVOICE, kind: "MENSUALITE" } } },
  });
  if (e.status !== "ACTIVE") return 0;
  const year = e.group.schoolYear;
  const covered = new Set(e.invoices.flatMap((i) => periodSpan(i.period, i.months)));
  const months = billableMonths(year.billingMonths, periodOf(e.startDate), e.endDate ? periodOf(e.endDate) : null).filter((m) => !covered.has(m));
  const data = planInvoices(months, e.plan, e.monthlyFee, year.dueDay, e.startDate).map((p) => ({ enrollmentId: e.id, ...p }));
  if (data.length) await tx.invoice.createMany({ data });
  return data.length;
}

/** Génère les échéances de toutes les inscriptions actives de l'année. */
export async function syncAllInvoices(schoolYearId: string, userId: string) {
  const enrollments = await db.enrollment.findMany({ where: { status: "ACTIVE", group: { schoolYearId } }, select: { id: true } });
  let created = 0;
  for (const e of enrollments) created += await syncInvoicesForEnrollment(e.id);
  await audit(userId, "invoice.generate", "SchoolYear", schoolYearId, { created });
  return created;
}

/** Annule (sans supprimer) les mensualités sans paiement à partir de `fromPeriod`. */
export async function voidUnpaidInvoices(tx: Tx, enrollmentId: string, fromPeriod: string, reason: string) {
  const res = await tx.invoice.updateMany({
    where: { enrollmentId, kind: "MENSUALITE", ...LIVE_INVOICE, period: { gte: fromPeriod }, allocations: { none: { payment: { cancelledAt: null } } } },
    data: { cancelledAt: new Date(), cancelReason: reason },
  });
  return res.count;
}

/**
 * Modifie le tarif et/ou l'échéancier d'une inscription à partir d'un mois donné : les échéances futures
 * non réglées sont annulées (motif tracé) puis régénérées ; celles déjà (partiellement) payées sont conservées.
 */
export async function changeEnrollmentTerms(
  enrollmentId: string,
  input: { monthlyFee: number; plan: PaymentPlan; fromPeriod: string; reason: string },
  userId: string,
) {
  if (!input.reason.trim()) throw new BusinessError("Le motif de la modification est obligatoire.");
  return db.$transaction(async (tx) => {
    const e = await tx.enrollment.findUniqueOrThrow({ where: { id: enrollmentId }, include: { group: true } });
    if (e.status !== "ACTIVE") throw new BusinessError("Inscription terminée : modification impossible.");
    const voided = await voidUnpaidInvoices(tx, enrollmentId, input.fromPeriod, `Modification des conditions : ${input.reason}`);
    await tx.enrollment.update({ where: { id: enrollmentId }, data: { monthlyFee: input.monthlyFee, plan: input.plan } });
    const created = await syncInvoicesForEnrollment(enrollmentId, tx);
    await audit(userId, "enrollment.terms", "Student", e.studentId, {
      enrollmentId, group: e.group.name, from: { monthlyFee: e.monthlyFee, plan: e.plan }, to: { monthlyFee: input.monthlyFee, plan: input.plan },
      fromPeriod: input.fromPeriod, reason: input.reason, voided, created,
    }, tx);
    return { voided, created };
  });
}

/** Échéances d'un élève avec montant payé (hors paiements annulés) et statut. */
export async function studentInvoices(studentId: string, schoolYearId?: string) {
  const invoices = await db.invoice.findMany({
    where: { ...LIVE_INVOICE, enrollment: { studentId, ...(schoolYearId ? { group: { schoolYearId } } : {}) } },
    include: { enrollment: { include: { group: { include: { subject: true } } } }, allocations: LIVE_ALLOC },
    orderBy: [{ dueDate: "asc" }],
  });
  const now = new Date();
  return invoices.map((i) => {
    const paid = i.allocations.reduce((s, a) => s + a.amount, 0);
    return { ...i, paid, remaining: i.amount - paid, status: invoiceStatus(i.amount, paid, i.dueDate, now) };
  });
}

export type StatementLine = { date: Date; kind: "ECHEANCE" | "PAIEMENT" | "ANNULATION"; label: string; ref: string | null; debit: number; credit: number; balance: number };

/** Relevé de compte chronologique (échéances au débit, paiements au crédit, annulations tracées). */
export async function studentStatement(studentId: string, schoolYearId: string): Promise<StatementLine[]> {
  const [invoices, payments] = await Promise.all([
    db.invoice.findMany({ where: { enrollment: { studentId, group: { schoolYearId } } }, include: { enrollment: { include: { group: true } } } }),
    db.payment.findMany({ where: { studentId, schoolYearId }, include: { mode: true } }),
  ]);
  const raw: Omit<StatementLine, "balance">[] = [];
  for (const i of invoices) {
    const label = `${i.period === "INSCRIPTION" ? "Frais d'inscription" : `Échéance ${i.period}${i.months > 1 ? ` (+${i.months - 1} mois)` : ""}`} — ${i.enrollment.group.name}`;
    raw.push({ date: i.dueDate, kind: "ECHEANCE", label, ref: null, debit: i.amount, credit: 0 });
    if (i.cancelledAt) raw.push({ date: i.cancelledAt, kind: "ANNULATION", label: `Annulation : ${label} (${i.cancelReason ?? ""})`, ref: null, debit: 0, credit: i.amount });
  }
  for (const p of payments) {
    raw.push({ date: p.paidAt, kind: "PAIEMENT", label: `Paiement ${p.mode.label}${p.reference ? ` (${p.reference})` : ""}`, ref: p.receiptNo, debit: 0, credit: p.amount });
    if (p.cancelledAt) raw.push({ date: p.cancelledAt, kind: "ANNULATION", label: `Annulation du reçu ${p.receiptNo} (${p.cancelReason ?? ""})`, ref: p.receiptNo, debit: p.amount, credit: 0 });
  }
  raw.sort((a, b) => a.date.getTime() - b.date.getTime() || (a.kind === "ECHEANCE" ? -1 : 1));
  let balance = 0;
  return raw.map((l) => ({ ...l, balance: (balance += l.debit - l.credit) }));
}

async function nextReceiptNo(tx: Tx, yearStart: string) {
  const last = await tx.payment.findFirst({ where: { receiptNo: { startsWith: `R-${yearStart}-` } }, orderBy: { receiptNo: "desc" }, select: { receiptNo: true } });
  const n = last ? Number(last.receiptNo.split("-")[2]) + 1 : 1;
  return `R-${yearStart}-${String(n).padStart(6, "0")}`;
}

export type PaymentInput = {
  studentId: string;
  amount: number;
  modeId: string;
  reference: string | null;
  paidAt: string;
  note: string | null;
  invoiceIds: string[];
};

async function createPaymentTx(tx: Tx, input: PaymentInput, userId: string, schoolYearId: string, yearLabel: string, correctsId?: string) {
  if (input.paidAt > todayISO()) throw new BusinessError("La date de paiement ne peut pas être dans le futur.");
  const mode = await tx.paymentMode.findUnique({ where: { id: input.modeId } });
  if (!mode || !mode.active) throw new BusinessError("Moyen de paiement inconnu ou désactivé.");
  if (mode.requiresReference && !input.reference) throw new BusinessError(`La référence est obligatoire pour un paiement par ${mode.label.toLowerCase()}.`);
  const invoices = await tx.invoice.findMany({
    where: { ...LIVE_INVOICE, enrollment: { studentId: input.studentId, group: { schoolYearId } } },
    include: { allocations: LIVE_ALLOC },
  });
  let allocations;
  try {
    allocations = allocateFIFO(
      invoices.map((i) => ({ id: i.id, amount: i.amount, dueDate: i.dueDate, paid: i.allocations.reduce((s, a) => s + a.amount, 0) })),
      input.amount,
      input.invoiceIds,
    );
  } catch (e) {
    throw new BusinessError((e as Error).message);
  }
  const receiptNo = await nextReceiptNo(tx, yearLabel.slice(0, 4));
  const payment = await tx.payment.create({
    data: {
      receiptNo, studentId: input.studentId, schoolYearId, amount: input.amount, modeId: mode.id, reference: input.reference,
      paidAt: parseDay(input.paidAt), note: input.note, createdById: userId, correctsId, allocations: { create: allocations },
    },
    include: { student: true },
  });
  return payment;
}

/** Transaction sérialisable avec reprise en cas de conflit (numérotation des reçus). */
async function serializable<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(fn, { isolationLevel: "Serializable" });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if ((code === "P2002" || code === "P2034") && attempt < 2) continue;
      throw e;
    }
  }
}

export async function recordPayment(input: PaymentInput, userId: string) {
  const year = await getActiveYear();
  const payment = await serializable(async (tx) => {
    const p = await createPaymentTx(tx, input, userId, year.id, year.label);
    await audit(userId, "payment.create", "Payment", p.id, { receiptNo: p.receiptNo, amount: p.amount, studentId: p.studentId }, tx);
    return p;
  });
  await notify({
    type: "PAIEMENT", permission: "payments.read", dedupeKey: `payment:${payment.id}`,
    title: `Paiement ${payment.receiptNo} : ${formatMoney(payment.amount)}`,
    body: `${payment.student.lastName} ${payment.student.firstName}`, href: `/payments/${payment.id}`,
  });
  return payment;
}

export async function cancelPayment(paymentId: string, reason: string, userId: string) {
  if (!reason.trim()) throw new BusinessError("Le motif d'annulation est obligatoire.");
  const p = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (p.cancelledAt) throw new BusinessError("Ce paiement est déjà annulé.");
  await db.payment.update({ where: { id: paymentId }, data: { cancelledAt: new Date(), cancelReason: reason.trim() } });
  await audit(userId, "payment.cancel", "Payment", paymentId, { receiptNo: p.receiptNo, amount: p.amount, reason });
}

/**
 * Correction d'un paiement : le reçu d'origine est annulé (motif « Corrigé par … ») et un nouveau reçu,
 * lié à l'original, est émis avec les bonnes valeurs. Les deux restent consultables.
 */
export async function correctPayment(originalId: string, input: Omit<PaymentInput, "studentId">, reason: string, userId: string) {
  if (!reason.trim()) throw new BusinessError("Le motif de la correction est obligatoire.");
  return serializable(async (tx) => {
    const orig = await tx.payment.findUniqueOrThrow({ where: { id: originalId }, include: { schoolYear: true } });
    if (orig.cancelledAt) throw new BusinessError("Ce reçu est déjà annulé ou corrigé.");
    await tx.payment.update({ where: { id: originalId }, data: { cancelledAt: new Date(), cancelReason: `Correction : ${reason.trim()}` } });
    const p = await createPaymentTx(tx, { ...input, studentId: orig.studentId }, userId, orig.schoolYearId, orig.schoolYear.label, orig.id);
    await tx.payment.update({ where: { id: originalId }, data: { cancelReason: `Corrigé par ${p.receiptNo} : ${reason.trim()}` } });
    await audit(userId, "payment.correct", "Payment", p.id, {
      replaces: orig.receiptNo, receiptNo: p.receiptNo, before: { amount: orig.amount, modeId: orig.modeId, paidAt: orig.paidAt.toISOString().slice(0, 10) },
      after: { amount: p.amount, modeId: p.modeId, paidAt: input.paidAt }, reason,
    }, tx);
    return p;
  });
}

export type Balance = { billed: number; paid: number; remaining: number; overdue: number };

/** Solde par élève sur une année : facturé, payé (hors annulations), reste dû et reste échu. */
export async function studentBalances(studentIds: string[], schoolYearId: string, now = new Date()): Promise<Map<string, Balance>> {
  const out = new Map<string, Balance>(studentIds.map((id) => [id, { billed: 0, paid: 0, remaining: 0, overdue: 0 }]));
  if (!studentIds.length) return out;
  const invoices = await db.invoice.findMany({
    where: { ...LIVE_INVOICE, enrollment: { studentId: { in: studentIds }, group: { schoolYearId } } },
    select: { amount: true, dueDate: true, enrollment: { select: { studentId: true } }, allocations: { ...LIVE_ALLOC, select: { amount: true } } },
  });
  for (const i of invoices) {
    const b = out.get(i.enrollment.studentId)!;
    const paid = i.allocations.reduce((s, a) => s + a.amount, 0);
    b.billed += i.amount;
    b.paid += paid;
    b.remaining += i.amount - paid;
    if (isLate(i.dueDate, now)) b.overdue += i.amount - paid;
  }
  return out;
}

export type UnpaidFilters = { groupId?: string; levelId?: string; minDays?: number };

/** Élèves ayant un reste à payer sur des échéances échues (filtrable par groupe, niveau, ancienneté). */
export async function unpaidSummary(schoolYearId: string, now = new Date(), f: UnpaidFilters = {}) {
  const limit = parseDay(todayISO(now));
  const before = f.minDays ? new Date(limit.getTime() - f.minDays * 86400_000) : limit;
  const invoices = await db.invoice.findMany({
    where: {
      ...LIVE_INVOICE, dueDate: { lt: before },
      enrollment: { group: { schoolYearId, ...(f.groupId ? { id: f.groupId } : {}), ...(f.levelId ? { levelId: f.levelId } : {}) } },
    },
    include: {
      allocations: { ...LIVE_ALLOC, select: { amount: true } },
      enrollment: {
        include: {
          group: { select: { name: true } },
          student: { include: { level: true, guardians: { include: { guardian: true }, orderBy: { isPayer: "desc" } } } },
        },
      },
    },
  });
  type Row = { student: (typeof invoices)[number]["enrollment"]["student"]; due: number; count: number; oldest: Date; groups: Set<string> };
  const byStudent = new Map<string, Row>();
  for (const i of invoices) {
    const remaining = i.amount - i.allocations.reduce((s, a) => s + a.amount, 0);
    if (remaining <= 0) continue;
    const s = i.enrollment.student;
    const cur = byStudent.get(s.id) ?? { student: s, due: 0, count: 0, oldest: i.dueDate, groups: new Set<string>() };
    cur.due += remaining;
    cur.count += 1;
    cur.groups.add(i.enrollment.group.name);
    if (i.dueDate < cur.oldest) cur.oldest = i.dueDate;
    byStudent.set(s.id, cur);
  }
  return [...byStudent.values()].sort((a, b) => b.due - a.due);
}
