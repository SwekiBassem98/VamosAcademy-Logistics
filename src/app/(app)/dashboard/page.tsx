import Link from "next/link";
import { Suspense } from "react";
import { CalendarClock, CircleAlert, ClipboardCheck, DoorOpen, GraduationCap, UserPlus, Users, Wallet } from "lucide-react";
import { Card, CardLink, PageHeader, Stat, Badge, LinkButton, EmptyState, Callout, Skeleton } from "@/components/ui";
import { BarChart, HBars } from "@/components/charts";
import { requireUser, type CurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { groupScope, studentScope } from "@/server/scope";
import { unpaidSummary } from "@/server/services/finance";
import { visibleWhere } from "@/server/services/notifications";
import { demoCounts } from "@/server/services/demo";
import { can } from "@/lib/permissions";
import { formatDate, formatDateTime, formatMinutes, formatMoney, todayISO, parseDay, WEEKDAYS } from "@/lib/format";

export const metadata = { title: "Tableau de bord" };

const MONTH_SHORT = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const ACTION_LABEL: Record<string, string> = {
  "student.create": "Nouveau dossier élève", "student.update": "Dossier élève modifié", "student.archive": "Dossier archivé",
  "enrollment.create": "Inscription", "enrollment.end": "Fin d'inscription", "payment.create": "Paiement encaissé",
  "payment.cancel": "Paiement annulé", "expense.create": "Dépense enregistrée", "attendance.save": "Appel enregistré",
  "grades.save": "Notes saisies", "group.create": "Groupe créé", "group.update": "Groupe modifié", "teacher.create": "Enseignant ajouté",
  "user.login": "Connexion", "user.save": "Compte utilisateur modifié", "settings.update": "Paramètres modifiés",
};
const DAY = 86400_000;
const weekdayOf = (d: Date) => ((d.getUTCDay() + 6) % 7) + 1;
// Amplitude d'ouverture servant au taux d'occupation des salles (8 h – 20 h)
const OPEN_MIN = 12 * 60;

function hello() {
  const h = Number(new Intl.DateTimeFormat("fr-FR", { timeZone: "Africa/Tunis", hour: "numeric", hourCycle: "h23" }).format(new Date()));
  return h >= 18 ? "Bonsoir" : "Bonjour";
}

export default async function Dashboard() {
  const user = await requireUser();
  const year = await db.schoolYear.findFirst({ where: { active: true } });
  if (!year) {
    return (
      <>
        <PageHeader title={`${hello()} ${user.fullName}`} />
        <EmptyState title="Aucune année scolaire active" text="Créez et activez l'année en cours pour commencer."
          action={can(user.role, "settings.manage") && <LinkButton href="/settings">Ouvrir les paramètres</LinkButton>} />
      </>
    );
  }
  const finance = can(user.role, "dashboard.finance");
  const att = can(user.role, "attendance.read");
  const teacherView = user.role === "ENSEIGNANT";
  const today = todayISO();
  const todayDate = parseDay(today);
  const weekday = weekdayOf(todayDate);
  const monday = new Date(todayDate.getTime() - (weekday - 1) * DAY);
  const gScope = groupScope(user);
  const since = new Date(todayDate.getTime() - 56 * DAY);
  const since30 = new Date(todayDate.getTime() - 30 * DAY);

  const [demo, newEnrollments, recentAbsences, todo, activeStudents, enrollments, slots, attRecords, groups, activity, weekSessions] = await Promise.all([
    can(user.role, "users.manage") ? demoCounts() : null,
    db.enrollment.count({ where: { createdAt: { gte: since30 }, group: { schoolYearId: year.id, ...gScope } } }),
    att
      ? db.attendanceRecord.findMany({
          where: { status: { in: ["ABSENT", "EXCUSE"] }, session: { date: { gte: new Date(todayDate.getTime() - 7 * DAY) }, group: { schoolYearId: year.id, ...gScope } } },
          include: { student: true, session: { include: { group: true } } }, orderBy: { session: { date: "desc" } }, take: 8,
        })
      : [],
    Promise.all([
      db.notification.count({ where: { ...visibleWhere(user), status: "NOUVELLE" } }),
      can(user.role, "messages.write") ? db.message.count({ where: { status: "PREPARE" } }) : 0,
      can(user.role, "expenses.read") ? db.expense.count({ where: { cancelledAt: null, schoolYearId: year.id, attachments: { none: {} }, teacherPayId: null } }) : 0,
      can(user.role, "students.write") ? db.student.count({ where: { status: "PREINSCRIT" } }) : 0,
      att ? db.attendanceRecord.count({ where: { status: "ABSENT", note: null, session: { date: { gte: new Date(todayDate.getTime() - 7 * DAY) }, group: { schoolYearId: year.id, ...gScope } } } }) : 0,
    ]),
    db.student.count({ where: { status: "ACTIF", ...studentScope(user) } }),
    db.enrollment.count({ where: { status: "ACTIVE", group: { schoolYearId: year.id, ...gScope } } }),
    // Créneaux de la semaine : aujourd'hui, les prochains jours et l'activité des salles / enseignants
    db.scheduleSlot.findMany({
      where: { group: { schoolYearId: year.id, active: true, ...gScope } },
      include: { group: { include: { subject: true, teacher: true, sessions: { where: { date: todayDate }, select: { id: true, records: { select: { status: true } } } } } }, room: true },
      orderBy: [{ weekday: "asc" }, { startMin: "asc" }],
    }),
    att
      ? db.attendanceRecord.findMany({ where: { session: { date: { gte: since }, group: { schoolYearId: year.id, ...gScope } } }, select: { status: true, session: { select: { date: true } } } })
      : [],
    db.group.findMany({
      where: { schoolYearId: year.id, active: true, ...gScope },
      include: { level: { include: { cycle: true } }, _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } },
    }),
    can(user.role, "audit.read")
      ? db.auditLog.findMany({ where: { action: { not: "user.login" } }, include: { user: { select: { fullName: true } } }, orderBy: { createdAt: "desc" }, take: 6 })
      : [],
    can(user.role, "teachers.read") && !teacherView
      ? db.attendanceSession.findMany({ where: { date: { gte: monday, lte: todayDate }, group: { schoolYearId: year.id } }, select: { group: { select: { teacherId: true } } } })
      : [],
  ]);

  const todaySlots = slots.filter((s) => s.weekday === weekday);
  // Prochains cours : les 3 jours suivants qui ont des créneaux
  const upcoming: { date: Date; slots: typeof slots }[] = [];
  for (let i = 1; i <= 7 && upcoming.length < 3; i++) {
    const d = new Date(todayDate.getTime() + i * DAY);
    const list = slots.filter((s) => s.weekday === weekdayOf(d));
    if (list.length) upcoming.push({ date: d, slots: list });
  }

  // Présence par semaine (8 dernières semaines)
  const weeks = Array.from({ length: 8 }, (_, i) => {
    const start = new Date(since.getTime() + i * 7 * DAY);
    const end = new Date(start.getTime() + 7 * DAY);
    const recs = attRecords.filter((r) => r.session.date >= start && r.session.date < end);
    const ok = recs.filter((r) => r.status === "PRESENT" || r.status === "RETARD").length;
    return { label: `${start.getUTCDate()} ${MONTH_SHORT[start.getUTCMonth()]}`, values: [recs.length ? (ok / recs.length) * 100 : 0] };
  });
  const attTotal = attRecords.length;
  const attOk = attRecords.filter((r) => r.status === "PRESENT" || r.status === "RETARD").length;

  // Effectifs par cycle (Primaire, Collège, Secondaire)
  const byCycle = new Map<string, { value: number; max: number; order: number }>();
  for (const g of groups) {
    const c = byCycle.get(g.level.cycle.name) ?? { value: 0, max: 0, order: g.level.cycle.order };
    c.value += g._count.enrollments;
    c.max += g.capacity;
    byCycle.set(g.level.cycle.name, c);
  }

  // Salles : occupation du jour
  const rooms = new Map<string, { minutes: number; count: number }>();
  for (const s of todaySlots) {
    const r = rooms.get(s.room.name) ?? { minutes: 0, count: 0 };
    r.minutes += s.endMin - s.startMin;
    r.count++;
    rooms.set(s.room.name, r);
  }
  // Enseignants : séances tenues cette semaine / séances prévues jusqu'à aujourd'hui
  const teachers = new Map<string, { name: string; planned: number; held: number }>();
  if (!teacherView && can(user.role, "teachers.read")) {
    for (const s of slots) {
      if (!s.group.teacher || s.weekday > weekday) continue;
      const t = teachers.get(s.group.teacher.id) ?? { name: `${s.group.teacher.lastName} ${s.group.teacher.firstName[0]}.`, planned: 0, held: 0 };
      t.planned++;
      teachers.set(s.group.teacher.id, t);
    }
    for (const ws of weekSessions) {
      const t = ws.group.teacherId ? teachers.get(ws.group.teacherId) : undefined;
      if (t) t.held++;
    }
  }

  const tasks = [
    { href: "/notifications", label: "Notifications non lues", n: todo[0], tone: "red" as const, show: true },
    { href: "/attendance", label: "Absences à justifier (7 jours)", n: todo[4], tone: "amber" as const, show: att },
    { href: "/messages", label: "Messages préparés à envoyer", n: todo[1], tone: "amber" as const, show: can(user.role, "messages.write") },
    { href: "/expenses?state=nodoc", label: "Dépenses sans justificatif", n: todo[2], tone: "amber" as const, show: can(user.role, "expenses.read") },
    { href: "/students?status=PREINSCRIT", label: "Pré-inscriptions à finaliser", n: todo[3], tone: "blue" as const, show: can(user.role, "students.write") },
  ].filter((t) => t.show);
  const pending = todaySlots.filter((s) => !s.group.sessions.length).length;

  return (
    <>
      <PageHeader
        title={`${hello()} ${user.fullName}`}
        subtitle={<>Année scolaire {year.label} · <span className="capitalize">{WEEKDAYS[weekday].toLowerCase()}</span> {formatDate(new Date())}</>}
        primary={can(user.role, "payments.write") ? <LinkButton href="/payments/new"><Wallet /> Encaisser</LinkButton>
          : teacherView ? <LinkButton href="/attendance"><ClipboardCheck /> Appels du jour</LinkButton> : undefined}
        actions={can(user.role, "students.write") && <LinkButton href="/students/new" variant="secondary"><UserPlus /> Nouvel élève</LinkButton>}
      />
      {demo && demo.total > 0 && (
        <Callout tone="warning" className="mb-5">
          Données de démonstration présentes ({demo.students} élève(s), {demo.accounts} compte(s) de test au mot de passe connu).
          Avant toute utilisation réelle, supprimez-les dans <Link href="/settings" className="font-semibold underline">Paramètres → Données de démonstration</Link>.
        </Callout>
      )}

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-3 lg:gap-6">
        {/* Indicateurs clés */}
        <div className="grid grid-cols-2 gap-3 max-lg:order-3 sm:gap-4 lg:col-span-3 lg:grid-cols-4">
          <Stat icon={<Users />} label={teacherView ? "Mes élèves" : "Élèves actifs"} value={activeStudents} hint={`${enrollments} inscription(s) en cours`} href={can(user.role, "students.read") ? "/students" : undefined} />
          <Stat icon={<UserPlus />} label="Nouvelles inscriptions" value={newEnrollments} hint="sur 30 jours" />
          {finance ? (
            <Suspense fallback={<><StatSkeleton /><StatSkeleton /></>}><FinanceStats yearId={year.id} /></Suspense>
          ) : att ? (
            <>
              <Stat icon={<ClipboardCheck />} label="Présence (8 sem.)" value={attTotal ? `${Math.round((attOk / attTotal) * 100)} %` : "—"} hint={`${attTotal} pointage(s)`} />
              <Stat icon={<CalendarClock />} label="Séances aujourd'hui" value={todaySlots.length} hint={pending ? `${pending} appel(s) à faire` : "appels à jour"} href="/attendance" />
            </>
          ) : null}
        </div>

        <div className="max-lg:contents lg:col-span-2 lg:flex lg:flex-col lg:gap-6">
          {/* Aujourd'hui */}
          <Card className="max-lg:order-1" title="Aujourd'hui" description={todaySlots.length ? `${todaySlots.length} séance(s) · ${pending} appel(s) à faire` : undefined}
            actions={att && <CardLink href="/attendance">Présences →</CardLink>} flush>
            {todaySlots.length === 0 ? <p className="px-4 py-6 text-sm text-muted sm:px-5">Aucune séance programmée aujourd&apos;hui.</p> : (
              <ul className="divide-y divide-line">
                {todaySlots.map((s) => {
                  const sess = s.group.sessions[0];
                  const absent = sess?.records.filter((r) => r.status === "ABSENT").length ?? 0;
                  const href = att ? `/attendance?group=${s.groupId}&date=${today}` : can(user.role, "academics.read") ? `/academics/groups/${s.groupId}` : undefined;
                  const body = (
                    <>
                      <span className="w-14 shrink-0 font-display text-sm font-bold text-navy tabular-nums">{formatMinutes(s.startMin)}<span className="block text-xs font-medium text-muted">{formatMinutes(s.endMin)}</span></span>
                      <span aria-hidden className="h-9 w-1 shrink-0 rounded-full" style={{ background: s.group.subject.color }} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-semibold text-ink">{s.group.name}</span>
                        <span className="block truncate text-xs text-muted">{s.room.name}{s.group.teacher && !teacherView && ` · ${s.group.teacher.lastName}`}</span>
                      </span>
                      {sess ? <Badge tone={absent ? "amber" : "green"}>{absent ? `${absent} absent(s)` : "appel fait"}</Badge> : <Badge tone="red" dot>à faire</Badge>}
                    </>
                  );
                  return (
                    <li key={s.id}>
                      {href ? <Link href={href} className="flex min-h-14 items-center gap-3 px-4 py-2.5 transition hover:bg-surface sm:px-5">{body}</Link>
                        : <div className="flex min-h-14 items-center gap-3 px-4 py-2.5 sm:px-5">{body}</div>}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {finance && (
            <Suspense fallback={<CardSkeleton className="max-lg:order-4" />}><UnpaidCard yearId={year.id} user={user} /></Suspense>
          )}

          {finance && (
            <Suspense fallback={<CardSkeleton className="max-lg:order-8" tall />}><MonthlyChart year={year} today={today} reports={can(user.role, "reports.read")} /></Suspense>
          )}
          {!finance && att && (
            <Card title="Taux de présence hebdomadaire" className="max-lg:order-8">
              {attTotal ? <BarChart data={weeks} series={[{ name: "Présence" }]} unit="percent" height={180} caption="Taux de présence par semaine, en pourcentage" />
                : <p className="text-sm text-muted">Aucun appel enregistré sur les 8 dernières semaines.</p>}
            </Card>
          )}

          {upcoming.length > 0 && (
            <Card title="Prochains cours" className="max-lg:order-7" actions={can(user.role, "academics.read") && <CardLink href="/schedule">Emploi du temps →</CardLink>}>
              <div className="grid gap-4 sm:grid-cols-3">
                {upcoming.map((u) => (
                  <div key={u.date.toISOString()} className="min-w-0">
                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">{WEEKDAYS[weekdayOf(u.date)]} {formatDate(u.date).slice(0, 5)}</p>
                    <ul className="space-y-1.5 text-sm">
                      {u.slots.slice(0, 5).map((s) => (
                        <li key={s.id} className="flex gap-2"><span className="w-11 shrink-0 font-semibold tabular-nums text-navy">{formatMinutes(s.startMin)}</span><span className="truncate">{s.group.name}</span></li>
                      ))}
                      {u.slots.length > 5 && <li className="text-xs text-muted">+ {u.slots.length - 5} autre(s)</li>}
                    </ul>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="max-lg:contents lg:flex lg:flex-col lg:gap-6">
          <Card title="À traiter" className="max-lg:order-2" flush>
            <ul className="divide-y divide-line">
              {tasks.map((t) => (
                <li key={t.href}>
                  <Link href={t.href} className="flex min-h-12 items-center justify-between gap-3 px-4 text-sm transition hover:bg-surface sm:px-5">
                    <span className={t.n ? "font-medium text-ink" : "text-muted"}>{t.label}</span>
                    <Badge tone={t.n ? t.tone : "green"}>{t.n}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </Card>

          {att && (
            <Card title="Absences récentes" description="7 derniers jours" className="max-lg:order-5" flush>
              {recentAbsences.length === 0 ? <p className="px-4 py-6 text-sm text-muted sm:px-5">Aucune absence.</p> : (
                <ul className="divide-y divide-line text-sm">
                  {recentAbsences.map((a) => (
                    <li key={a.id} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                      <span className="min-w-0 flex-1">
                        <Link href={`/students/${a.studentId}`} className="block truncate font-medium text-ink hover:text-brand">{a.student.lastName} {a.student.firstName}</Link>
                        <span className="block truncate text-xs text-muted">{formatDate(a.session.date)} · {a.session.group.name}</span>
                      </span>
                      <Badge tone={a.status === "EXCUSE" ? "blue" : a.note ? "amber" : "red"}>{a.status === "EXCUSE" ? "excusé" : a.note ? "motif" : "à justifier"}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {finance && <Suspense fallback={<CardSkeleton className="max-lg:order-6" />}><RecentPayments /></Suspense>}

          {byCycle.size > 0 && (
            <Card title="Remplissage par cycle" description="Inscriptions actives / places ouvertes" className="max-lg:order-9">
              <HBars unit="count" rows={[...byCycle.entries()].sort((a, b) => a[1].order - b[1].order).map(([label, c]) => ({ label, value: c.value, max: c.max, hint: `${c.value} inscrits pour ${c.max} places` }))} />
            </Card>
          )}

          {rooms.size > 0 && !teacherView && (
            <Card title="Salles aujourd'hui" description="Temps occupé sur une journée de 12 h" className="max-lg:order-10" actions={<DoorOpen className="size-4 text-faint" aria-hidden />}>
              <HBars unit="count" rows={[...rooms.entries()].sort((a, b) => b[1].minutes - a[1].minutes).map(([label, r]) => ({ label, value: r.minutes, max: OPEN_MIN, display: `${r.count} cours · ${Math.round((r.minutes / OPEN_MIN) * 100)} %` }))} />
            </Card>
          )}

          {teachers.size > 0 && (
            <Card title="Enseignants cette semaine" description="Appels enregistrés / séances prévues à ce jour" className="max-lg:order-11" actions={<GraduationCap className="size-4 text-faint" aria-hidden />}>
              <ul className="space-y-2 text-sm">
                {[...teachers.values()].sort((a, b) => (a.held / a.planned) - (b.held / b.planned)).slice(0, 6).map((t) => (
                  <li key={t.name} className="flex items-center justify-between gap-2">
                    <span className="truncate">{t.name}</span>
                    <Badge tone={t.held >= t.planned ? "green" : t.held === 0 ? "red" : "amber"}>{t.held}/{t.planned}</Badge>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          {activity.length > 0 && (
            <Card title="Activité récente" className="max-lg:order-12" actions={<CardLink href="/audit">Journal →</CardLink>}>
              <ol className="space-y-2.5 text-sm">
                {activity.map((a) => (
                  <li key={a.id} className="border-l-2 border-brand/40 pl-3">
                    <p className="font-medium text-navy">{ACTION_LABEL[a.action] ?? a.action}</p>
                    <p className="text-xs text-muted">{a.user?.fullName ?? "Système"} · {formatDateTime(a.createdAt)}</p>
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}


function StatSkeleton() {
  return <div className="rounded-lg border border-line bg-white p-4"><Skeleton className="h-3 w-24" /><Skeleton className="mt-3 h-7 w-28" /><Skeleton className="mt-2 h-3 w-20" /></div>;
}
function CardSkeleton({ className, tall }: { className?: string; tall?: boolean }) {
  return (
    <div className={`rounded-lg border border-line bg-white p-5 ${className ?? ""}`} aria-busy="true" aria-label="Chargement">
      <Skeleton className="h-4 w-40" />
      <div className="mt-4 space-y-3">{Array.from({ length: tall ? 6 : 4 }, (_, i) => <Skeleton key={i} className="h-4 w-full" />)}</div>
    </div>
  );
}

async function FinanceStats({ yearId }: { yearId: string }) {
  const monthStart = parseDay(`${todayISO().slice(0, 8)}01`);
  const [cashed, spent, unpaid] = await Promise.all([
    db.payment.aggregate({ _sum: { amount: true }, where: { cancelledAt: null, paidAt: { gte: monthStart } } }),
    db.expense.aggregate({ _sum: { amount: true }, where: { cancelledAt: null, spentAt: { gte: monthStart } } }),
    unpaidSummary(yearId),
  ]);
  return (
    <>
      <Stat icon={<Wallet />} label="Encaissé ce mois" tone="green" value={formatMoney(cashed._sum.amount ?? 0)} hint={`Dépenses : ${formatMoney(spent._sum.amount ?? 0)}`} href="/payments" />
      <Stat icon={<CircleAlert />} label="Impayés échus" tone="brand" value={formatMoney(unpaid.reduce((s, u) => s + u.due, 0))} hint={`${unpaid.length} élève(s)`} href="/unpaid" />
    </>
  );
}

async function UnpaidCard({ yearId, user }: { yearId: string; user: CurrentUser }) {
  const unpaid = await unpaidSummary(yearId);
  return (
    <Card title="Retards de paiement" description={unpaid.length ? `${unpaid.length} élève(s) · ${formatMoney(unpaid.reduce((s, u) => s + u.due, 0))}` : undefined}
      className="max-lg:order-4" actions={unpaid.length > 0 && <CardLink href="/unpaid">Tout voir →</CardLink>} flush>
      {unpaid.length === 0 ? <p className="px-4 py-6 text-sm text-muted sm:px-5">Aucun retard : tous les élèves sont à jour.</p> : (
        <ul className="divide-y divide-line">
          {unpaid.slice(0, 5).map((u) => (
            <li key={u.student.id} className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
              <span className="min-w-0 flex-1">
                <Link href={`/students/${u.student.id}`} className="block truncate font-medium text-ink hover:text-brand">{u.student.lastName} {u.student.firstName}</Link>
                <span className="block text-xs text-muted">{u.count} échéance(s) · depuis le {formatDate(u.oldest)}</span>
              </span>
              <span className="text-right">
                <span className="block font-bold text-brand tabular-nums">{formatMoney(u.due)}</span>
                {can(user.role, "payments.write") && <Link href={`/payments/new?student=${u.student.id}`} className="inline-flex min-h-8 items-center text-xs font-semibold text-navy hover:text-brand">Encaisser</Link>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

async function MonthlyChart({ year, today, reports }: { year: { id: string; billingMonths: string[] }; today: string; reports: boolean }) {
  const [payments, expenses] = await Promise.all([
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
  return (
    <Card title="Encaissements et dépenses" description="Par mois, axe en milliers de DT" className="max-lg:order-8" actions={reports && <CardLink href="/reports">Rapports →</CardLink>}>
      {monthly.length ? <BarChart data={monthly} series={[{ name: "Encaissé" }, { name: "Dépenses" }]} unit="money" caption="Encaissements et dépenses mensuels, en milliers de dinars" />
        : <p className="text-sm text-muted">Pas encore de données pour cette année.</p>}
    </Card>
  );
}

async function RecentPayments() {
  const recent = await db.payment.findMany({ where: { cancelledAt: null }, orderBy: { createdAt: "desc" }, take: 6, include: { student: true, mode: true } });
  return (
    <Card title="Derniers paiements" className="max-lg:order-6" actions={<CardLink href="/payments">Tout voir →</CardLink>} flush>
      {recent.length === 0 ? <p className="px-4 py-6 text-sm text-muted sm:px-5">Aucun paiement.</p> : (
        <ul className="divide-y divide-line">
          {recent.map((p) => (
            <li key={p.id}>
              <Link href={`/payments/${p.id}`} className="flex items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-surface sm:px-5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-ink">{p.student.lastName} {p.student.firstName}</span>
                  <span className="block text-xs text-muted">{formatDate(p.paidAt)} · {p.mode.label}</span>
                </span>
                <span className="font-bold tabular-nums text-success-600">{formatMoney(p.amount)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
