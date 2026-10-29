import "server-only";
import { db } from "../db";
import { audit } from "../audit";
import { BusinessError } from "../action";
import { getActiveYear } from "./finance";
import { computeTeacherPay } from "@/lib/payroll";
import { formatMoney, parseDay, todayISO } from "@/lib/format";

const DEFAULT_SESSION_MIN = 90;

function monthRange(period: string) {
  const [y, m] = period.split("-").map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1)) };
}

/**
 * Éléments variables du mois pour un enseignant :
 * - séances tenues = appels enregistrés sur ses groupes ; durée = créneau du jour (90 min par défaut pour un rattrapage) ;
 * - assiette = mensualités encaissées (paiements non annulés, datés du mois) sur les inscriptions de ses groupes.
 */
export async function payInputs(teacherId: string, period: string) {
  const { start, end } = monthRange(period);
  const sessions = await db.attendanceSession.findMany({
    where: { date: { gte: start, lt: end }, group: { teacherId } },
    include: { group: { include: { slots: true } } },
    orderBy: { date: "asc" },
  });
  const lines = sessions.map((s) => {
    const wd = ((s.date.getUTCDay() + 6) % 7) + 1;
    const slot = s.group.slots.find((x) => x.weekday === wd);
    const minutes = slot ? slot.endMin - slot.startMin : DEFAULT_SESSION_MIN;
    return { date: s.date.toISOString().slice(0, 10), group: s.group.name, minutes, scheduled: !!slot };
  });
  const alloc = await db.paymentAllocation.aggregate({
    _sum: { amount: true },
    where: { payment: { cancelledAt: null, paidAt: { gte: start, lt: end } }, invoice: { kind: "MENSUALITE", enrollment: { group: { teacherId } } } },
  });
  return { lines, minutes: lines.reduce((s, l) => s + l.minutes, 0), sessions: lines.length, collected: alloc._sum.amount ?? 0 };
}

/** Calcule (ou recalcule tant qu'elle est en brouillon) la paie d'un enseignant pour un mois. */
export async function draftPay(teacherId: string, period: string, userId: string) {
  if (!/^\d{4}-\d{2}$/.test(period)) throw new BusinessError("Période invalide.");
  if (period > todayISO().slice(0, 7)) throw new BusinessError("Impossible de calculer une paie pour un mois futur.");
  const t = await db.teacher.findUniqueOrThrow({ where: { id: teacherId } });
  const existing = await db.teacherPay.findFirst({ where: { teacherId, period, status: { not: "ANNULE" } } });
  if (existing && existing.status !== "BROUILLON") throw new BusinessError(`La paie ${period} de ${t.lastName} est déjà ${existing.status === "PAYE" ? "payée" : "validée"}. Annulez-la pour la recalculer.`);
  const inp = await payInputs(teacherId, period);
  const { quantity, amount } = computeTeacherPay(t.payMode, t.payRate, inp);
  const data = {
    payMode: t.payMode, rate: t.payRate, quantity, computedAmount: amount, amount: amount + (existing?.adjustment ?? 0),
    details: { sessions: inp.lines, minutes: inp.minutes, collected: inp.collected },
  };
  const pay = existing
    ? await db.teacherPay.update({ where: { id: existing.id }, data })
    : await db.teacherPay.create({ data: { ...data, teacherId, period, createdById: userId } });
  await audit(userId, existing ? "pay.recompute" : "pay.draft", "TeacherPay", pay.id, { teacherId, period, computed: amount });
  return pay;
}

export async function validatePay(id: string, adjustment: number, note: string | null, userId: string) {
  const p = await db.teacherPay.findUniqueOrThrow({ where: { id } });
  if (p.status !== "BROUILLON") throw new BusinessError("Seule une paie en brouillon peut être validée.");
  if (adjustment !== 0 && !note) throw new BusinessError("Justifiez l'ajustement (prime, retenue, séance non pointée…).");
  const amount = p.computedAmount + adjustment;
  if (amount < 0) throw new BusinessError("Le montant final ne peut pas être négatif.");
  await db.teacherPay.update({ where: { id }, data: { adjustment, adjustmentNote: note, amount, status: "VALIDE", validatedById: userId, validatedAt: new Date() } });
  await audit(userId, "pay.validate", "TeacherPay", id, { computed: p.computedAmount, adjustment, amount, note });
}

/** Paiement : passe la paie à « payée » et enregistre la dépense correspondante (catégorie Salaires enseignants). */
export async function markPayPaid(id: string, input: { modeId: string; paidAt: string; reference: string | null }, userId: string) {
  const p = await db.teacherPay.findUniqueOrThrow({ where: { id }, include: { teacher: true } });
  if (p.status !== "VALIDE") throw new BusinessError("La paie doit être validée avant d'être payée.");
  if (input.paidAt > todayISO()) throw new BusinessError("La date de paiement ne peut pas être dans le futur.");
  const mode = await db.paymentMode.findUnique({ where: { id: input.modeId } });
  if (!mode?.active) throw new BusinessError("Moyen de paiement inconnu ou désactivé.");
  if (mode.requiresReference && !input.reference) throw new BusinessError(`Référence obligatoire pour ${mode.label.toLowerCase()}.`);
  const year = await getActiveYear();
  const category = await db.expenseCategory.upsert({ where: { name: "Salaires enseignants" }, update: {}, create: { name: "Salaires enseignants" } });
  await db.$transaction(async (tx) => {
    await tx.teacherPay.update({ where: { id }, data: { status: "PAYE", paidAt: parseDay(input.paidAt), modeId: mode.id } });
    await tx.expense.create({
      data: {
        schoolYearId: year.id, categoryId: category.id, label: `Rémunération ${p.period} — ${p.teacher.lastName} ${p.teacher.firstName}`,
        amount: p.amount, modeId: mode.id, reference: input.reference, spentAt: parseDay(input.paidAt), createdById: userId, teacherPayId: p.id,
      },
    });
    await audit(userId, "pay.paid", "TeacherPay", id, { amount: p.amount, mode: mode.code, paidAt: input.paidAt }, tx);
  });
}

/** Annulation tracée ; si la paie était payée, la dépense liée est annulée avec le même motif. */
export async function cancelPay(id: string, reason: string, userId: string) {
  if (reason.trim().length < 3) throw new BusinessError("Le motif d'annulation est obligatoire.");
  const p = await db.teacherPay.findUniqueOrThrow({ where: { id }, include: { expense: true } });
  if (p.status === "ANNULE") throw new BusinessError("Paie déjà annulée.");
  await db.$transaction(async (tx) => {
    await tx.teacherPay.update({ where: { id }, data: { status: "ANNULE", cancelledAt: new Date(), cancelReason: reason.trim() } });
    if (p.expense && !p.expense.cancelledAt) {
      await tx.expense.update({ where: { id: p.expense.id }, data: { cancelledAt: new Date(), cancelReason: `Paie annulée : ${reason.trim()}` } });
    }
    await audit(userId, "pay.cancel", "TeacherPay", id, { period: p.period, amount: p.amount, reason, expenseCancelled: !!p.expense }, tx);
  });
  return `Paie annulée (${formatMoney(p.amount)}).`;
}
