import "server-only";
import type { NotificationType, Prisma } from "@prisma/client";
import { db } from "../db";
import type { CurrentUser } from "../auth";
import { can, type Permission } from "@/lib/permissions";
import { formatDate, formatMoney, parseDay, todayISO } from "@/lib/format";

export type NotifyInput = {
  type: NotificationType;
  title: string;
  body?: string | null;
  href?: string | null;
  permission: Permission;
  teacherId?: string | null;
  dedupeKey?: string | null;
};

/** Crée une notification interne ; ignorée si `dedupeKey` existe déjà (idempotent). Ne lève jamais d'erreur. */
export async function notify(n: NotifyInput) {
  try {
    if (n.dedupeKey) {
      await db.notification.upsert({ where: { dedupeKey: n.dedupeKey }, update: {}, create: { ...n } });
    } else {
      await db.notification.create({ data: { ...n } });
    }
  } catch (e) {
    console.error("notification", e);
  }
}

/** Filtre : notifications visibles pour l'utilisateur (selon ses permissions ; enseignant : les siennes). */
export function visibleWhere(user: CurrentUser): Prisma.NotificationWhereInput {
  const perms = ["students.read", "students.write", "attendance.read", "attendance.write", "payments.read", "expenses.read", "teachers.write", "settings.manage"]
    .filter((p) => can(user.role, p as Permission));
  if (user.role === "ENSEIGNANT") return { teacherId: user.teacherId ?? "__aucun__", permission: { in: perms } };
  return { permission: { in: perms } };
}

let lastSync = 0;

/**
 * Génère les alertes datées (idempotent grâce à dedupeKey) : échéances proches, retards de paiement,
 * absences sans justificatif, dépenses sans justificatif. Appelé au plus une fois par minute.
 */
export async function syncAlerts(force = false) {
  if (!force && Date.now() - lastSync < 60_000) return;
  lastSync = Date.now();
  const year = await db.schoolYear.findFirst({ where: { active: true } });
  if (!year) return;
  const today = parseDay(todayISO());
  const in3 = new Date(today.getTime() + 3 * 86400_000);

  // 1. Échéances dans les 3 prochains jours, non réglées → une alerte par élève et par date
  const upcoming = await db.invoice.findMany({
    where: { cancelledAt: null, dueDate: { gte: today, lte: in3 }, enrollment: { status: "ACTIVE", group: { schoolYearId: year.id } } },
    include: { allocations: { where: { payment: { cancelledAt: null } } }, enrollment: { include: { student: true } } },
  });
  for (const i of upcoming) {
    const rest = i.amount - i.allocations.reduce((s, a) => s + a.amount, 0);
    if (rest <= 0) continue;
    const s = i.enrollment.student;
    await notify({
      type: "ECHEANCE", permission: "payments.read", dedupeKey: `due:${i.id}`,
      title: `Échéance le ${formatDate(i.dueDate)} : ${s.lastName} ${s.firstName}`, body: `Reste à payer ${formatMoney(rest)}`, href: `/students/${s.id}`,
    });
  }

  // 2. Retards : une alerte par élève et par mois de retard
  const late = await db.invoice.findMany({
    where: { cancelledAt: null, dueDate: { lt: today }, enrollment: { group: { schoolYearId: year.id } } },
    include: { allocations: { where: { payment: { cancelledAt: null } } }, enrollment: { include: { student: true } } },
  });
  const lateBy = new Map<string, { name: string; due: number }>();
  for (const i of late) {
    const rest = i.amount - i.allocations.reduce((s, a) => s + a.amount, 0);
    if (rest <= 0) continue;
    const s = i.enrollment.student;
    const cur = lateBy.get(s.id) ?? { name: `${s.lastName} ${s.firstName}`, due: 0 };
    cur.due += rest;
    lateBy.set(s.id, cur);
  }
  for (const [id, v] of lateBy) {
    await notify({
      type: "RETARD", permission: "payments.read", dedupeKey: `late:${id}:${todayISO().slice(0, 7)}`,
      title: `Retard de paiement : ${v.name}`, body: `${formatMoney(v.due)} échus non réglés`, href: `/students/${id}`,
    });
  }

  // 3. Absences de plus de 48 h sans justificatif
  const limit = new Date(today.getTime() - 2 * 86400_000);
  const absences = await db.attendanceRecord.findMany({
    where: { status: "ABSENT", note: null, session: { date: { lte: limit, gte: year.startDate } } },
    include: { student: true, session: { include: { group: true } } },
    take: 200,
  });
  for (const a of absences) {
    await notify({
      type: "JUSTIFICATIF", permission: "attendance.write", teacherId: a.session.group.teacherId, dedupeKey: `just:${a.id}`,
      title: `Justificatif manquant : ${a.student.lastName} ${a.student.firstName}`,
      body: `Absent le ${formatDate(a.session.date)} (${a.session.group.name})`, href: `/attendance?group=${a.session.groupId}&date=${a.session.date.toISOString().slice(0, 10)}`,
    });
  }

  // 4. Dépenses sans justificatif
  const expenses = await db.expense.findMany({
    where: { cancelledAt: null, schoolYearId: year.id, attachments: { none: {} }, teacherPayId: null, NOT: { corrects: { is: { attachments: { some: {} } } } } },
    take: 200,
  });
  for (const e of expenses) {
    await notify({
      type: "JUSTIFICATIF", permission: "expenses.read", dedupeKey: `expdoc:${e.id}`,
      title: `Dépense sans justificatif : ${e.label}`, body: `${formatMoney(e.amount)} le ${formatDate(e.spentAt)}`, href: `/expenses/${e.id}`,
    });
  }
}

/** Les alertes « justificatif manquant » se ferment automatiquement quand le justificatif est fourni. */
export async function resolveByKey(dedupeKey: string, note: string) {
  await db.notification.updateMany({ where: { dedupeKey, status: { not: "TRAITEE" } }, data: { status: "TRAITEE", handledAt: new Date(), handledNote: note } });
}

export const TYPE_LABEL: Record<NotificationType, string> = {
  NOUVEL_INSCRIT: "Nouvel inscrit", PAIEMENT: "Paiement", ABSENCE: "Absence", ECHEANCE: "Échéance", RETARD: "Retard de paiement",
  JUSTIFICATIF: "Justificatif manquant", SYSTEME: "Système",
};
