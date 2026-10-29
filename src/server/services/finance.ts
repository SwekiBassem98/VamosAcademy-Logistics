import "server-only";
import type { PaymentMethod } from "@prisma/client";
import { db, type Tx } from "../db";
import { audit } from "../audit";
import { BusinessError } from "../action";
import { allocateFIFO, billableMonths, dueDateFor, invoiceStatus, isLate } from "@/lib/billing";
import { periodOf, parseDay, todayISO } from "@/lib/format";

export async function getActiveYear() {
  const y = await db.schoolYear.findFirst({ where: { active: true } });
  if (!y) throw new BusinessError("Aucune année scolaire active. Configurez-la dans Paramètres.");
  return y;
}

/** Crée les échéances manquantes d'une inscription (idempotent). */
export async function syncInvoicesForEnrollment(enrollmentId: string, tx: Tx | typeof db = db): Promise<number> {
  const e = await tx.enrollment.findUniqueOrThrow({
    where: { id: enrollmentId },
    include: { group: { include: { schoolYear: true } }, invoices: true },
  });
  if (e.status !== "ACTIVE") return 0;
  const year = e.group.schoolYear;
  const existing = new Set(e.invoices.map((i) => i.period));
  const months = billableMonths(year.billingMonths, periodOf(e.startDate), e.endDate ? periodOf(e.endDate) : null);
  const data = months
    .filter((p) => !existing.has(p))
    .map((p) => ({ enrollmentId: e.id, period: p, amount: e.monthlyFee, dueDate: dueDateFor(p, year.dueDay, e.startDate) }));
  if (data.length) await tx.invoice.createMany({ data, skipDuplicates: true });
  return data.length;
}

/** Génère les échéances de toutes les inscriptions actives de l'année. */
export async function syncAllInvoices(schoolYearId: string, userId: string) {
  const enrollments = await db.enrollment.findMany({
    where: { status: "ACTIVE", group: { schoolYearId } },
    select: { id: true },
  });
  let created = 0;
  for (const e of enrollments) created += await syncInvoicesForEnrollment(e.id);
  await audit(userId, "invoice.generate", "SchoolYear", schoolYearId, { created });
  return created;
}

/** Échéances d'un élève avec montant payé (hors paiements annulés) et statut. */
export async function studentInvoices(studentId: string, schoolYearId?: string) {
  const invoices = await db.invoice.findMany({
    where: { enrollment: { studentId, ...(schoolYearId ? { group: { schoolYearId } } : {}) } },
    include: {
      enrollment: { include: { group: { include: { subject: true } } } },
      allocations: { where: { payment: { cancelledAt: null } } },
    },
    orderBy: [{ dueDate: "asc" }],
  });
  const now = new Date();
  return invoices.map((i) => {
    const paid = i.allocations.reduce((s, a) => s + a.amount, 0);
    return { ...i, paid, remaining: i.amount - paid, status: invoiceStatus(i.amount, paid, i.dueDate, now) };
  });
}

async function nextNumber(tx: Tx, prefix: string, yearStart: string) {
  const last = await tx.payment.findFirst({
    where: { receiptNo: { startsWith: `${prefix}-${yearStart}-` } },
    orderBy: { receiptNo: "desc" },
    select: { receiptNo: true },
  });
  const n = last ? Number(last.receiptNo.split("-")[2]) + 1 : 1;
  return `${prefix}-${yearStart}-${String(n).padStart(6, "0")}`;
}

export async function recordPayment(
  input: {
    studentId: string;
    amount: number;
    method: PaymentMethod;
    reference: string | null;
    paidAt: string;
    note: string | null;
    invoiceIds: string[];
  },
  userId: string,
) {
  const year = await getActiveYear();
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => {
          const invoices = await tx.invoice.findMany({
            where: { enrollment: { studentId: input.studentId, group: { schoolYearId: year.id } } },
            include: { allocations: { where: { payment: { cancelledAt: null } } } },
          });
          let allocations;
          try {
            allocations = allocateFIFO(
              invoices.map((i) => ({
                id: i.id, amount: i.amount, dueDate: i.dueDate,
                paid: i.allocations.reduce((s, a) => s + a.amount, 0),
              })),
              input.amount,
              input.invoiceIds,
            );
          } catch (e) {
            throw new BusinessError((e as Error).message);
          }
          const receiptNo = await nextNumber(tx, "R", year.label.slice(0, 4));
          const payment = await tx.payment.create({
            data: {
              receiptNo,
              studentId: input.studentId,
              schoolYearId: year.id,
              amount: input.amount,
              method: input.method,
              reference: input.reference,
              paidAt: parseDay(input.paidAt),
              note: input.note,
              createdById: userId,
              allocations: { create: allocations },
            },
          });
          await audit(userId, "payment.create", "Payment", payment.id, { receiptNo, amount: input.amount }, tx);
          return payment;
        },
        { isolationLevel: "Serializable" },
      );
    } catch (e) {
      const code = (e as { code?: string }).code;
      if ((code === "P2002" || code === "P2034") && attempt < 2) continue;
      throw e;
    }
  }
  throw new BusinessError("Conflit d'enregistrement, réessayez.");
}

export async function cancelPayment(paymentId: string, reason: string, userId: string) {
  if (!reason.trim()) throw new BusinessError("Le motif d'annulation est obligatoire.");
  const p = await db.payment.findUniqueOrThrow({ where: { id: paymentId } });
  if (p.cancelledAt) throw new BusinessError("Ce paiement est déjà annulé.");
  await db.payment.update({ where: { id: paymentId }, data: { cancelledAt: new Date(), cancelReason: reason.trim() } });
  await audit(userId, "payment.cancel", "Payment", paymentId, { receiptNo: p.receiptNo, reason });
}

export type Balance = { billed: number; paid: number; remaining: number; overdue: number };

/** Solde par élève sur une année : facturé, payé (hors annulations), reste dû et reste échu. */
export async function studentBalances(studentIds: string[], schoolYearId: string, now = new Date()): Promise<Map<string, Balance>> {
  const out = new Map<string, Balance>(studentIds.map((id) => [id, { billed: 0, paid: 0, remaining: 0, overdue: 0 }]));
  if (!studentIds.length) return out;
  const invoices = await db.invoice.findMany({
    where: { enrollment: { studentId: { in: studentIds }, group: { schoolYearId } } },
    select: { amount: true, dueDate: true, enrollment: { select: { studentId: true } }, allocations: { where: { payment: { cancelledAt: null } }, select: { amount: true } } },
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

/** Élèves ayant un reste à payer sur des échéances échues. */
export async function unpaidSummary(schoolYearId: string, now = new Date()) {
  const invoices = await db.invoice.findMany({
    // échéances dont le jour est écoulé : strictement avant aujourd'hui midi (dates stockées à 12:00 UTC)
    where: { dueDate: { lt: parseDay(todayISO(now)) }, enrollment: { group: { schoolYearId } } },
    include: {
      allocations: { where: { payment: { cancelledAt: null } }, select: { amount: true } },
      enrollment: {
        include: {
          student: { include: { guardians: { include: { guardian: true }, orderBy: { isPayer: "desc" } } } },
        },
      },
    },
  });
  const byStudent = new Map<string, { student: (typeof invoices)[number]["enrollment"]["student"]; due: number; count: number; oldest: Date }>();
  for (const i of invoices) {
    const remaining = i.amount - i.allocations.reduce((s, a) => s + a.amount, 0);
    if (remaining <= 0) continue;
    const s = i.enrollment.student;
    const cur = byStudent.get(s.id) ?? { student: s, due: 0, count: 0, oldest: i.dueDate };
    cur.due += remaining;
    cur.count += 1;
    if (i.dueDate < cur.oldest) cur.oldest = i.dueDate;
    byStudent.set(s.id, cur);
  }
  return [...byStudent.values()].sort((a, b) => b.due - a.due);
}
