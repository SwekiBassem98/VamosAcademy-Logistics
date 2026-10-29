import Link from "next/link";
import { Card, PageHeader, Stat, Table, Td, Badge, LinkButton, EmptyState } from "@/components/ui";
import { BarChart, HBars } from "@/components/charts";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { groupScope, studentScope } from "@/server/scope";
import { unpaidSummary } from "@/server/services/finance";
import { visibleWhere } from "@/server/services/notifications";
import { demoCounts } from "@/server/services/demo";
import { can } from "@/lib/permissions";
import { formatDate, formatDateTime, formatMinutes, formatMoney, todayISO, parseDay } from "@/lib/format";

export const metadata = { title: "Tableau de bord" };

const MONTH_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const ACTION_LABEL: Record<string, string> = {
  "student.create": "Nouveau dossier élève", "student.update": "Dossier élève modifié", "student.archive": "Dossier archivé",
  "enrollment.create": "Inscription", "enrollment.end": "Fin d'inscription", "payment.create": "Paiement encaissé",
  "payment.cancel": "Paiement annulé", "expense.create": "Dépense enregistrée", "attendance.save": "Appel enregistré",
  "grades.save": "Notes saisies", "group.create": "Groupe créé", "group.update": "Groupe modifié", "teacher.create": "Enseignant ajouté",
  "user.login": "Connexion", "user.save": "Compte utilisateur modifié", "settings.update": "Paramètres modifiés",
};

export default async function Dashboard() {
  const user = await requireUser();
  const year = await db.schoolYear.findFirst({ where: { active: true } });
  if (!year) {
    return (
      <>
        <PageHeader title={`Bonjour ${user.fullName}`} />
        <EmptyState title="Aucune année scolaire active" text="Créez et activez l'année en cours pour commencer." action={can(user.role, "settings.manage") && <LinkButton href="/settings">Paramètres</LinkButton>} />
      </>
    );
  }
  const finance = can(user.role, "dashboard.finance");
  const demo = can(user.role, "users.manage") ? await demoCounts() : null;
  const today = todayISO();
  const todayDate = parseDay(today);
  const monthStart = parseDay(`${today.slice(0, 8)}01`);
  const weekday = ((todayDate.getUTCDay() + 6) % 7) + 1;
  const gScope = groupScope(user);
  const since = new Date(todayDate.getTime() - 56 * 86400_000);

  const since30 = new Date(todayDate.getTime() - 30 * 86400_000);
  const [newEnrollments, recentAbsences, todo] = await Promise.all([
    db.enrollment.count({ where: { createdAt: { gte: since30 }, group: { schoolYearId: year.id, ...gScope } } }),
    can(user.role, "attendance.read")
      ? db.attendanceRecord.findMany({
          where: { status: { in: ["ABSENT", "EXCUSE"] }, session: { date: { gte: new Date(todayDate.getTime() - 7 * 86400_000) }, group: { schoolYearId: year.id, ...gScope } } },
          include: { student: true, session: { include: { group: true } } }, orderBy: { session: { date: "desc" } }, take: 8,
        })
      : [],
    Promise.all([
      db.notification.count({ where: { ...visibleWhere(user), status: "NOUVELLE" } }),
      can(user.role, "messages.write") ? db.message.count({ where: { status: "PREPARE" } }) : 0,
      can(user.role, "expenses.read") ? db.expense.count({ where: { cancelledAt: null, schoolYearId: year.id, attachments: { none: {} }, teacherPayId: null } }) : 0,
      can(user.role, "students.write") ? db.student.count({ where: { status: "PREINSCRIT" } }) : 0,
    ]),
  ]);
  const [activeStudents, enrollments, slotsToday, attRecords, groups, activity] = await Promise.all([
    db.student.count({ where: { status: "ACTIF", ...studentScope(user) } }),
    db.enrollment.count({ where: { status: "ACTIVE", group: { schoolYearId: year.id, ...gScope } } }),
    db.scheduleSlot.findMany({
      where: { weekday, group: { schoolYearId: year.id, active: true, ...gScope } },
      include: { group: { include: { subject: true, teacher: true, sessions: { where: { date: todayDate }, select: { id: true } } } }, room: true },
      orderBy: { startMin: "asc" },
    }),
    can(user.role, "attendance.read")
      ? db.attendanceRecord.findMany({ where: { session: { date: { gte: since }, group: { schoolYearId: year.id, ...gScope } } }, select: { status: true, session: { select: { date: true } } } })
      : [],
    db.group.findMany({
      where: { schoolYearId: year.id, active: true, ...gScope },
      include: { level: { include: { cycle: true } }, _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } },
    }),
    can(user.role, "audit.read")
      ? db.auditLog.findMany({ where: { action: { not: "user.login" } }, include: { user: { select: { fullName: true } } }, orderBy: { createdAt: "desc" }, take: 8 })
      : [],
  ]);

  // Présence par semaine (8 dernières semaines)
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(since.getTime() + i * 7 * 86400_000);
    const end = new Date(start.getTime() + 7 * 86400_000);
    const recs = attRecords.filter((r) => r.session.date >= start && r.session.date < end);
    const ok = recs.filter((r) => r.status === "PRESENT" || r.status === "RETARD").length;
    return { label: `${start.getUTCDate()} ${MONTH_SHORT[start.getUTCMonth()]}`, values: [recs.length ? (ok / recs.length) * 100 : 0], n: recs.length };
  });
  const attTotal = attRecords.length;
  const attOk = attRecords.filter((r) => r.status === "PRESENT" || r.status === "RETARD").length;

  // Effectifs par cycle
  const byCycle = new Map<string, { value: number; max: number; order: number }>();
  for (const g of groups) {
    const c = byCycle.get(g.level.cycle.name) ?? { value: 0, max: 0, order: g.level.cycle.order };
    c.value += g._count.enrollments;
    c.max += g.capacity;
    byCycle.set(g.level.cycle.name, c);
  }

  let fin: null | {
    cashed: number; spent: number; unpaid: Awaited<ReturnType<typeof unpaidSummary>>;
    monthly: { label: string; values: number[] }[];
    recent: { id: string; receiptNo: string; amount: number; paidAt: Date; student: { firstName: string; lastName: string } }[];
  } = null;
  if (finance) {
    const [cashed, spent, unpaid, recent, payments, expenses] = await Promise.all([
      db.payment.aggregate({ _sum: { amount: true }, where: { cancelledAt: null, paidAt: { gte: monthStart } } }),
      db.expense.aggregate({ _sum: { amount: true }, where: { cancelledAt: null, spentAt: { gte: monthStart } } }),
      unpaidSummary(year.id),
      db.payment.findMany({ where: { cancelledAt: null }, orderBy: { createdAt: "desc" }, take: 6, include: { student: true } }),
      db.payment.findMany({ where: { schoolYearId: year.id, cancelledAt: null }, select: { amount: true, paidAt: true } }),
      db.expense.findMany({ where: { schoolYearId: year.id, cancelledAt: null }, select: { amount: true, spentAt: true } }),
    ]);
    const key = (d: Date) => d.toISOString().slice(0, 7);
    const monthly = year.billingMonths.filter((m) => m <= today.slice(0, 7)).map((m) => ({
      label: `${MONTH_SHORT[Number(m.slice(5)) - 1]} ${m.slice(2, 4)}`,
      values: [
        payments.filter((p) => key(p.paidAt) === m).reduce((s, p) => s + p.amount, 0),
        expenses.filter((e) => key(e.spentAt) === m).reduce((s, e) => s + e.amount, 0),
      ],
    }));
    fin = { cashed: cashed._sum.amount ?? 0, spent: spent._sum.amount ?? 0, unpaid, recent, monthly };
  }

  return (
    <>
      <PageHeader
        title={`Bonjour ${user.fullName}`}
        subtitle={`Année scolaire ${year.label} · ${formatDate(new Date())}`}
        actions={<>
          {can(user.role, "students.write") && <LinkButton href="/students/new" variant="secondary">Nouvel élève</LinkButton>}
          {can(user.role, "payments.write") && <LinkButton href="/payments/new">Encaisser</LinkButton>}
          {user.role === "ENSEIGNANT" && <LinkButton href="/attendance">Appels du jour</LinkButton>}
        </>}
      />
      {demo && demo.total > 0 && (
        <p role="alert" className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          Données de démonstration présentes ({demo.students} élève(s), {demo.accounts} compte(s) de test au mot de passe connu).
          Avant toute utilisation réelle, supprimez-les dans <Link href="/settings" className="font-medium underline">Paramètres → Données de démonstration</Link>.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={user.role === "ENSEIGNANT" ? "Mes élèves" : "Élèves actifs"} value={activeStudents} hint={`${enrollments} inscription(s) en cours · ${newEnrollments} nouvelle(s) sur 30 jours`} />
        {can(user.role, "attendance.read") && <Stat label="Présence (8 semaines)" value={attTotal ? `${Math.round((attOk / attTotal) * 100)} %` : "—"} hint={`${attTotal} pointage(s)`} />}
        {fin && <Stat label="Encaissé ce mois" tone="green" value={formatMoney(fin.cashed)} hint={`Dépenses du mois : ${formatMoney(fin.spent)}`} />}
        {!fin && <Stat label="Nouvelles inscriptions" value={newEnrollments} hint="sur les 30 derniers jours" />}
        {fin && <Stat label="Impayés échus" tone="brand" value={formatMoney(fin.unpaid.reduce((s, u) => s + u.due, 0))} hint={`${fin.unpaid.length} élève(s) concerné(s)`} />}
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-3">
        {fin && (
          <Card title="Encaissements et dépenses par mois" className="xl:col-span-2">
            {fin.monthly.length ? <BarChart data={fin.monthly} series={[{ name: "Encaissé" }, { name: "Dépenses" }]} unit="money" caption="Encaissements et dépenses mensuels, en milliers de dinars" />
              : <p className="text-sm text-muted">Pas encore de données pour cette année.</p>}
            <p className="mt-1 text-[11px] text-muted">Axe en milliers de DT.</p>
          </Card>
        )}
        <Card title="Remplissage par cycle" className={fin ? "" : "xl:col-span-1"}>
          {byCycle.size === 0 ? <p className="text-sm text-muted">Aucun groupe actif.</p> : (
            <HBars unit="count" rows={[...byCycle.entries()].sort((a, b) => a[1].order - b[1].order).map(([label, c]) => ({ label, value: c.value, max: c.max, hint: `${c.value} inscrits pour ${c.max} places` }))} />
          )}
          <p className="mt-3 text-xs text-muted">Inscriptions actives / places ouvertes.</p>
        </Card>
        {can(user.role, "attendance.read") && (
          <Card title="Taux de présence hebdomadaire" className={fin ? "xl:col-span-2" : "xl:col-span-2"}>
            {attTotal ? <BarChart data={weeks.map((w) => ({ label: w.label, values: w.values }))} series={[{ name: "Présence" }]} unit="percent" height={180} caption="Taux de présence par semaine, en pourcentage" />
              : <p className="text-sm text-muted">Aucun appel enregistré sur les 8 dernières semaines.</p>}
          </Card>
        )}
        <Card title="À traiter">
          <ul className="space-y-2 text-sm">
            <li className="flex justify-between"><Link href="/notifications" className="hover:text-brand">Notifications non lues</Link><Badge tone={todo[0] ? "red" : "green"}>{todo[0]}</Badge></li>
            {can(user.role, "messages.write") && <li className="flex justify-between"><Link href="/messages" className="hover:text-brand">Messages préparés à envoyer</Link><Badge tone={todo[1] ? "amber" : "green"}>{todo[1]}</Badge></li>}
            {can(user.role, "expenses.read") && <li className="flex justify-between"><Link href="/expenses?state=nodoc" className="hover:text-brand">Dépenses sans justificatif</Link><Badge tone={todo[2] ? "amber" : "green"}>{todo[2]}</Badge></li>}
            {can(user.role, "students.write") && <li className="flex justify-between"><Link href="/students?status=PREINSCRIT" className="hover:text-brand">Pré-inscriptions à finaliser</Link><Badge tone={todo[3] ? "blue" : "green"}>{todo[3]}</Badge></li>}
          </ul>
        </Card>
        {can(user.role, "attendance.read") && (
          <Card title="Absences récentes (7 jours)" actions={<Link href="/attendance" className="text-xs text-brand">Présences</Link>}>
            {recentAbsences.length === 0 ? <p className="text-sm text-muted">Aucune absence.</p> : (
              <ul className="divide-y divide-line text-sm">
                {recentAbsences.map((a) => (
                  <li key={a.id} className="flex items-center justify-between gap-2 py-1.5">
                    <Link href={`/students/${a.studentId}`} className="truncate hover:text-brand">{a.student.lastName} {a.student.firstName}</Link>
                    <span className="text-xs text-muted">{formatDate(a.session.date)} · {a.session.group.name}</span>
                    <Badge tone={a.status === "EXCUSE" ? "blue" : a.note ? "amber" : "red"}>{a.status === "EXCUSE" ? "excusé" : a.note ? "motif" : "à justifier"}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        <Card title="Séances du jour" actions={can(user.role, "attendance.read") && <Link href="/attendance" className="text-xs text-brand">Appels</Link>}>
          {slotsToday.length === 0 ? <p className="text-sm text-muted">Aucune séance programmée aujourd&apos;hui.</p> : (
            <ul className="divide-y divide-line">
              {slotsToday.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="font-mono text-navy">{formatMinutes(s.startMin)}</span>
                  {can(user.role, "academics.read") ? <Link href={`/academics/groups/${s.groupId}`} className="flex-1 truncate font-medium hover:text-brand">{s.group.name}</Link> : <span className="flex-1 truncate font-medium">{s.group.name}</span>}
                  <span className="text-xs text-muted">{s.room.name}</span>
                  {s.group.sessions.length ? <Badge tone="green">appel fait</Badge> : <Badge>à faire</Badge>}
                </li>
              ))}
            </ul>
          )}
        </Card>
        {fin && (
          <Card title="Derniers paiements" actions={<Link href="/payments" className="text-xs text-brand">Tout voir</Link>}>
            {fin.recent.length === 0 ? <p className="text-sm text-muted">Aucun paiement.</p> : (
              <ul className="divide-y divide-line">
                {fin.recent.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <Link href={`/payments/${p.id}`} className="truncate hover:text-brand">{p.student.lastName} {p.student.firstName}</Link>
                    <span className="text-xs text-muted">{formatDate(p.paidAt)}</span>
                    <span className="font-semibold tabular-nums">{formatMoney(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        {activity.length > 0 && (
          <Card title="Activité récente" actions={<Link href="/audit" className="text-xs text-brand">Journal</Link>} className={fin ? "xl:col-span-2" : ""}>
            <ol className="space-y-2 text-sm">
              {activity.map((a) => (
                <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-2 border-l-2 border-brand/40 pl-3">
                  <span><span className="font-medium text-navy">{ACTION_LABEL[a.action] ?? a.action}</span> <span className="text-xs text-muted">par {a.user?.fullName ?? "Système"}</span></span>
                  <span className="text-xs text-muted">{formatDateTime(a.createdAt)}</span>
                </li>
              ))}
            </ol>
          </Card>
        )}
      </div>

      {fin && fin.unpaid.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-2 text-sm font-semibold text-navy">Retards de paiement</h2>
          <Table head={["Élève", "Échéances", "Depuis", "Montant dû", ""]}>
            {fin.unpaid.slice(0, 6).map((u) => (
              <tr key={u.student.id}>
                <Td><Link href={`/students/${u.student.id}`} className="font-medium hover:text-brand">{u.student.lastName} {u.student.firstName}</Link></Td>
                <Td><Badge tone="red">{u.count}</Badge></Td>
                <Td>{formatDate(u.oldest)}</Td>
                <Td className="font-semibold tabular-nums">{formatMoney(u.due)}</Td>
                <Td>{can(user.role, "payments.write") && <Link href={`/payments/new?student=${u.student.id}`} className="text-xs text-brand">Encaisser</Link>}</Td>
              </tr>
            ))}
          </Table>
          {fin.unpaid.length > 6 && <Link href="/unpaid" className="mt-2 inline-block text-sm text-brand">Voir les {fin.unpaid.length} élèves en retard →</Link>}
        </div>
      )}
    </>
  );
}
