import Link from "next/link";
import { Card, PageHeader, Forbidden, Table, Td, Badge, EmptyState } from "@/components/ui";
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

  return (
    <>
      <PageHeader title="Présences" subtitle={write ? "Choisissez un groupe et une date, puis faites l'appel." : "Consultation des appels (lecture seule)."} />
      <form className="mb-6 grid gap-2 sm:grid-cols-[1fr_180px_auto]">
        <select name="group" defaultValue={group?.id ?? ""} className="input" aria-label="Groupe">
          <option value="">Vue d&apos;ensemble du jour</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <input type="date" name="date" defaultValue={date} max={todayISO()} className="input" aria-label="Date" />
        <button className="rounded-md bg-navy px-4 py-2 text-sm font-medium text-white">Ouvrir</button>
      </form>

      {!group && (
        <Card title={`Séances prévues le ${WEEKDAYS[weekday].toLowerCase()} ${formatDate(day)}`}>
          {todays.length === 0 ? <EmptyState title="Aucune séance prévue ce jour" text="Choisissez un groupe ci-dessus pour un appel exceptionnel (rattrapage)." /> : (
            <Table head={["Horaire", "Groupe", "Salle", "Appel", ""]}>
              {todays.flatMap((g) => g.slots.filter((s) => s.weekday === weekday).map((s) => {
                const sess = g.sessions[0];
                const abs = sess?.records.filter((r) => r.status === "ABSENT").length ?? 0;
                return (
                  <tr key={s.id}>
                    <Td className="font-mono">{formatMinutes(s.startMin)}–{formatMinutes(s.endMin)}</Td>
                    <Td className="font-medium">{g.name}</Td>
                    <Td>{s.room.name}</Td>
                    <Td>{sess ? <Badge tone={abs ? "amber" : "green"}>fait · {abs} absent(s)</Badge> : <Badge tone="red">à faire</Badge>}</Td>
                    <Td><Link className="text-brand" href={`/attendance?group=${g.id}&date=${date}`}>{sess ? "Voir" : write ? "Faire l'appel" : "Voir"} →</Link></Td>
                  </tr>
                );
              }))}
            </Table>
          )}
        </Card>
      )}

      {group && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Card title={`${group.name} — ${WEEKDAYS[weekday]} ${formatDate(day)}`} className="lg:col-span-2">
            {!scheduled && <p className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Ce groupe n&apos;a pas de cours prévu ce jour : séance exceptionnelle (rattrapage).</p>}
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
                  return <tr key={s.id}><Td>{s.lastName} {s.firstName}</Td><Td>{r ? <Badge tone={TONE[r.status]}>{ATTENDANCE_LABEL[r.status]}</Badge> : "—"}</Td><Td className="text-xs">{r?.note ?? ""}</Td></tr>;
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
                    <li key={r.id} className="flex items-center justify-between gap-2 py-2">
                      <Link href={`/attendance?group=${group.id}&date=${r.date.toISOString().slice(0, 10)}`} className="hover:text-brand">{formatDate(r.date)}</Link>
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
