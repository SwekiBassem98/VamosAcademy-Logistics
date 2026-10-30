import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, PageHeader, Forbidden, Table, Td, Badge, EmptyState, Callout, ApplyButton, LinkButton, buttonClass } from "@/components/ui";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { groupScope } from "@/server/scope";
import { can } from "@/lib/permissions";
import { formatDate, formatMinutes, parseDay, todayISO, WEEKDAYS } from "@/lib/format";
import { ATTENDANCE_LABEL } from "@/lib/labels";
import { saveAttendance } from "./actions";
import { RollCall } from "./roll-call";

export const metadata = { title: "Présences" };
const TONE = { PRESENT: "green", ABSENT: "red", RETARD: "amber", EXCUSE: "blue" } as const;

export default async function Attendance({ searchParams }: { searchParams: Promise<{ group?: string; date?: string }> }) {
  const user = await pageUser("attendance.read");
  if (!user) return <Forbidden />;
  const write = can(user.role, "attendance.write");
  const sp = await searchParams;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(sp.date ?? "") ? sp.date! : todayISO();
  const day = parseDay(date);
  const weekday = ((day.getUTCDay() + 6) % 7) + 1;
  const groups = await db.group.findMany({
    where: { active: true, schoolYear: { active: true }, ...groupScope(user) },
    include: { subject: true, slots: { include: { room: true } }, sessions: { where: { date: day }, include: { records: { select: { status: true } } } } },
    orderBy: { name: "asc" },
  });
  const group = sp.group ? groups.find((g) => g.id === sp.group) : undefined;
  if (sp.group && !group) return <Forbidden />;

  const [enrollments, session, recent] = group
    ? await Promise.all([
        db.enrollment.findMany({ where: { groupId: group.id, status: "ACTIVE" }, include: { student: true }, orderBy: { student: { lastName: "asc" } } }),
        db.attendanceSession.findUnique({ where: { groupId_date: { groupId: group.id, date: day } }, include: { records: true } }),
        db.attendanceSession.findMany({ where: { groupId: group.id }, include: { records: true }, orderBy: { date: "desc" }, take: 10 }),
      ])
    : [[], null, []];
  const current = new Map(session?.records.map((r) => [r.studentId, r]));
  const todays = groups.filter((g) => g.slots.some((s) => s.weekday === weekday));
  const scheduled = group?.slots.some((s) => s.weekday === weekday);
  const shift = (n: number) => new Date(day.getTime() + n * 86400_000).toISOString().slice(0, 10);
  const nav = (d: string) => `/attendance?${new URLSearchParams({ ...(group ? { group: group.id } : {}), date: d })}`;
  const isToday = date === todayISO();

  return (
    <>
      <PageHeader title="Présences" subtitle={write ? "Choisissez une séance du jour ou un groupe et une date, puis faites l'appel." : "Consultation des appels (lecture seule)."}
        back={group ? { href: `/attendance?date=${date}`, label: "Séances du jour" } : undefined} />
      <form className="mb-5 grid gap-2 rounded-lg border border-line bg-white p-3 sm:grid-cols-[1fr_11rem_auto]" role="search" aria-label="Choisir la séance">
        <select name="group" defaultValue={group?.id ?? ""} className="input" aria-label="Groupe">
          <option value="">Vue d&apos;ensemble du jour</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <input type="date" name="date" defaultValue={date} max={todayISO()} className="input" aria-label="Date" />
        <ApplyButton>Ouvrir</ApplyButton>
      </form>
      <div className="no-print mb-4 flex items-center justify-between gap-2">
        <LinkButton variant="ghost" size="sm" href={nav(shift(-1))} aria-label="Jour précédent"><ChevronLeft /> <span className="max-xs:sr-only">Veille</span></LinkButton>
        <p className="text-center text-sm font-semibold text-navy"><span className="capitalize">{WEEKDAYS[weekday].toLowerCase()}</span> {formatDate(day)}{isToday && <Badge tone="brand" className="ml-2">aujourd&apos;hui</Badge>}</p>
        {isToday ? <span className={buttonClass({ variant: "ghost", size: "sm", className: "invisible" })} aria-hidden>Lendemain</span>
          : <LinkButton variant="ghost" size="sm" href={nav(shift(1))} aria-label="Jour suivant"><span className="max-xs:sr-only">Lendemain</span> <ChevronRight /></LinkButton>}
      </div>

      {!group && (
        <Card title="Séances prévues" description={todays.length ? `${todays.length} groupe(s)` : undefined} flush>
          {todays.length === 0 ? <div className="p-4"><EmptyState title="Aucune séance prévue ce jour" text="Choisissez un groupe ci-dessus pour un appel exceptionnel (rattrapage)." /></div> : (
            <ul className="divide-y divide-line">
              {todays.flatMap((g) => g.slots.filter((s) => s.weekday === weekday).map((s) => ({ g, s }))).sort((a, b) => a.s.startMin - b.s.startMin).map(({ g, s }) => {
                const sess = g.sessions[0];
                const abs = sess?.records.filter((r) => r.status === "ABSENT").length ?? 0;
                return (
                  <li key={s.id}>
                    <Link href={`/attendance?group=${g.id}&date=${date}`} className="flex min-h-16 items-center gap-3 px-4 py-3 transition hover:bg-surface sm:px-5">
                      <span className="w-14 shrink-0 font-display text-sm font-bold text-navy tabular-nums">{formatMinutes(s.startMin)}<span className="block text-xs font-medium text-muted">{formatMinutes(s.endMin)}</span></span>
                      <span aria-hidden className="h-10 w-1 shrink-0 rounded-full" style={{ background: g.subject.color }} />
                      <span className="min-w-0 flex-1"><span className="block line-clamp-2 break-words font-semibold text-ink">{g.name}</span><span className="block text-xs text-muted">{s.room.name}</span></span>
                      <span className="flex flex-col items-end gap-1">
                        {sess ? <Badge tone={abs ? "amber" : "green"}>{abs ? `${abs} absent(s)` : "appel fait"}</Badge> : <Badge tone="red" dot>à faire</Badge>}
                        <span className="text-xs font-semibold text-brand max-sm:hidden">{sess ? "Voir" : write ? "Faire l'appel" : "Voir"} →</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}

      {group && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title={group.name} description={`${WEEKDAYS[weekday]} ${formatDate(day)} · ${enrollments.length} élève(s)`} className="lg:col-span-2">
            {!scheduled && <Callout tone="warning" className="mb-3">Ce groupe n&apos;a pas de cours prévu ce jour : séance exceptionnelle (rattrapage).</Callout>}
            {enrollments.length === 0 ? <EmptyState title="Aucun élève inscrit" /> : write ? (
              <RollCall
                key={`${group.id}-${date}`}
                action={saveAttendance.bind(null, group.id, date)}
                topic={session?.topic ?? ""}
                isUpdate={!!session}
                rows={enrollments.map(({ student: s }) => ({ id: s.id, name: `${s.lastName} ${s.firstName}`, status: current.get(s.id)?.status ?? "PRESENT", note: current.get(s.id)?.note ?? "" }))}
              />
            ) : !session ? <p className="text-sm text-muted">Appel non effectué pour cette date.</p> : (
              <Table head={["Élève", "Statut", "Motif"]}>
                {enrollments.map(({ student: s }) => {
                  const r = current.get(s.id);
                  return <tr key={s.id}><Td cell="primary" className="font-semibold">{s.lastName} {s.firstName}</Td><Td>{r ? <Badge tone={TONE[r.status]}>{ATTENDANCE_LABEL[r.status]}</Badge> : "—"}</Td><Td className="text-xs">{r?.note ?? ""}</Td></tr>;
                })}
              </Table>
            )}
          </Card>
          <Card title="Séances récentes">
            {recent.length === 0 ? <p className="text-sm text-muted">Aucune séance.</p> : (
              <ul className="divide-y divide-line text-sm">
                {recent.map((r) => {
                  const c = (st: string) => r.records.filter((x) => x.status === st).length;
                  return (
                    <li key={r.id} className="flex min-h-11 items-center justify-between gap-2 py-1.5">
                      <Link href={`/attendance?group=${group.id}&date=${r.date.toISOString().slice(0, 10)}`} className="font-medium hover:text-brand">{formatDate(r.date)}</Link>
                      <span className="flex gap-1">
                        <Badge tone="green">{c("PRESENT") + c("RETARD")} P</Badge>
                        {c("ABSENT") > 0 && <Badge tone="red">{c("ABSENT")} A</Badge>}
                        {c("EXCUSE") > 0 && <Badge tone="blue">{c("EXCUSE")} E</Badge>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      )}
    </>
  );
}
