import "server-only";
import { db } from "./db";
import type { CurrentUser } from "./auth";
import { groupScope } from "./scope";
import { can } from "@/lib/permissions";
import { formatMoney, parseDay, todayISO } from "@/lib/format";
import type { Notice } from "@/components/topbar";

/** Alertes calculées en direct à partir des données, selon les permissions de l'utilisateur. */
export async function noticesFor(user: CurrentUser): Promise<Notice[]> {
  const year = await db.schoolYear.findFirst({ where: { active: true } });
  const out: Notice[] = [];
  if (!year) {
    if (can(user.role, "settings.manage")) out.push({ id: "year", title: "Aucune année scolaire active", detail: "Activez une année dans Paramètres", href: "/settings", tone: "red" });
    return out;
  }
  const today = parseDay(todayISO());
  const tasks: Promise<void>[] = [];

  if (can(user.role, "payments.read")) {
    tasks.push((async () => {
      const rows = await db.$queryRaw<{ students: bigint; due: bigint | null }[]>`
        SELECT COUNT(DISTINCT e."studentId") AS students, SUM(i.amount - COALESCE(a.paid, 0)) AS due
        FROM "Invoice" i
        JOIN "Enrollment" e ON e.id = i."enrollmentId"
        JOIN "Group" g ON g.id = e."groupId"
        LEFT JOIN (SELECT pa."invoiceId", SUM(pa.amount) AS paid FROM "PaymentAllocation" pa
                   JOIN "Payment" p ON p.id = pa."paymentId" AND p."cancelledAt" IS NULL GROUP BY pa."invoiceId") a ON a."invoiceId" = i.id
        WHERE g."schoolYearId" = ${year.id} AND i."dueDate" < ${today} AND i.amount > COALESCE(a.paid, 0)`;
      const n = Number(rows[0]?.students ?? 0);
      if (n) out.push({ id: "unpaid", title: `${n} élève(s) en retard de paiement`, detail: `Total dû : ${formatMoney(Number(rows[0].due ?? 0))}`, href: "/unpaid", tone: "red" });
    })());
  }
  if (can(user.role, "attendance.read")) {
    tasks.push((async () => {
      const n = await db.attendanceRecord.count({ where: { status: "ABSENT", session: { date: today, group: groupScope(user) } } });
      if (n) out.push({ id: "abs", title: `${n} absence(s) aujourd'hui`, detail: "Voir les appels du jour", href: "/attendance", tone: "amber" });
    })());
  }
  if (can(user.role, "students.write")) {
    tasks.push((async () => {
      const n = await db.student.count({ where: { status: "PREINSCRIT" } });
      if (n) out.push({ id: "pre", title: `${n} pré-inscription(s) à finaliser`, detail: "Dossiers au statut pré-inscrit", href: "/students?status=PREINSCRIT", tone: "blue" });
    })());
  }
  if (can(user.role, "academics.write")) {
    tasks.push((async () => {
      const groups = await db.group.findMany({ where: { schoolYearId: year.id, active: true }, select: { capacity: true, _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } } });
      const full = groups.filter((g) => g._count.enrollments >= g.capacity).length;
      if (full) out.push({ id: "full", title: `${full} groupe(s) complet(s)`, detail: "Capacité maximale atteinte", href: "/academics", tone: "blue" });
    })());
  }
  if (can(user.role, "users.manage")) {
    tasks.push((async () => {
      const n = await db.user.count({ where: { lockedUntil: { gt: new Date() } } });
      if (n) out.push({ id: "locked", title: `${n} compte(s) verrouillé(s)`, detail: "Échecs de connexion répétés", href: "/users", tone: "amber" });
    })());
  }
  await Promise.all(tasks);
  return out;
}
