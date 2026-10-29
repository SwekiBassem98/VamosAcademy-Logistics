import { PageHeader, Forbidden, Callout } from "@/components/ui";
import { FilterBar } from "@/components/table-tools";
import { PrintButton } from "@/components/print-button";
import { DocHeader, DocFooter } from "@/components/document";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { can } from "@/lib/permissions";
import { overlaps } from "@/lib/schedule";
import { formatMinutes, parseDay, todayISO } from "@/lib/format";
import { ScheduleBoard, type BoardSlot } from "./board";

export const metadata = { title: "Emploi du temps" };

export default async function Schedule({ searchParams }: { searchParams: Promise<{ room?: string; teacher?: string; print?: string }> }) {
  const user = await pageUser("academics.read");
  if (!user) return <Forbidden />;
  const sp = await searchParams;
  const teacherId = user.role === "ENSEIGNANT" ? (user.teacherId ?? "__none__") : sp.teacher || undefined;
  const todayDate = parseDay(todayISO());
  const today = ((todayDate.getUTCDay() + 6) % 7) + 1;
  const [slots, rooms, teachers, all] = await Promise.all([
    db.scheduleSlot.findMany({
      where: { group: { active: true, schoolYear: { active: true }, ...(teacherId ? { teacherId } : {}) }, ...(sp.room ? { roomId: sp.room } : {}) },
      include: { group: { include: { subject: true, teacher: true, sessions: { where: { date: todayDate }, select: { records: { select: { status: true } } } } } }, room: true },
      orderBy: { startMin: "asc" },
    }),
    db.room.findMany({ orderBy: { name: "asc" } }),
    user.role === "ENSEIGNANT" ? [] : db.teacher.findMany({ where: { active: true }, orderBy: { lastName: "asc" } }),
    // Tous les créneaux de l'année active, pour signaler les chevauchements même hors du filtre
    db.scheduleSlot.findMany({ where: { group: { active: true, schoolYear: { active: true } } }, select: { id: true, weekday: true, startMin: true, endMin: true, roomId: true, groupId: true, group: { select: { name: true, teacherId: true } } } }),
  ]);
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => d <= 6 || slots.some((s) => s.weekday === 7));
  const attendance = can(user.role, "attendance.read");

  const board: BoardSlot[] = slots.map((s) => {
    const conflicts = new Set<string>();
    for (const o of all) {
      if (o.id === s.id || !overlaps(s, o)) continue;
      if (o.roomId === s.roomId) conflicts.add(`Salle partagée avec ${o.group.name} (${formatMinutes(o.startMin)})`);
      if (s.group.teacherId && o.group.teacherId === s.group.teacherId) conflicts.add(`Enseignant aussi en ${o.group.name}`);
    }
    const sess = s.weekday === today ? s.group.sessions[0] : undefined;
    return {
      id: s.id, weekday: s.weekday, startMin: s.startMin, endMin: s.endMin, groupId: s.groupId, group: s.group.name, color: s.group.subject.color,
      room: s.room.name, teacher: s.group.teacher && user.role !== "ENSEIGNANT" ? s.group.teacher.lastName : null, conflicts: [...conflicts],
      status: attendance && s.weekday === today ? (sess ? "fait" : "a-faire") : undefined,
      absent: sess?.records.filter((r) => r.status === "ABSENT").length,
      href: attendance && s.weekday === today ? `/attendance?group=${s.groupId}&date=${todayISO()}` : undefined,
    };
  });
  const conflictCount = board.filter((b) => b.conflicts.length).length;

  return (
    <>
      <div className="no-print">
        <PageHeader title="Emploi du temps" subtitle="Créneaux hebdomadaires de l'année active. Les créneaux se gèrent depuis la fiche de chaque groupe." actions={<PrintButton auto={sp.print === "1"} />} />
        {user.role !== "ENSEIGNANT" && (
          <FilterBar params={sp} keep={[]}>
            <select name="room" defaultValue={sp.room ?? ""} className="input md:w-48" aria-label="Salle">
              <option value="">Toutes les salles</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <select name="teacher" defaultValue={sp.teacher ?? ""} className="input md:w-56" aria-label="Enseignant">
              <option value="">Tous les enseignants</option>
              {teachers.map((t) => <option key={t.id} value={t.id}>{t.lastName} {t.firstName}</option>)}
            </select>
          </FilterBar>
        )}
        {conflictCount > 0 && <Callout tone="danger" className="mb-4">{conflictCount} créneau(x) en conflit (même salle ou même enseignant au même moment) : corrigez-les depuis la fiche du groupe.</Callout>}
      </div>
      <div className="mb-4 hidden print:block">
        <DocHeader title="Emploi du temps" lines={[
          ...(teacherId && teachers.length ? [`Enseignant : ${teachers.find((t) => t.id === teacherId)?.lastName ?? ""}`] : []),
          ...(sp.room ? [`Salle : ${rooms.find((r) => r.id === sp.room)?.name ?? ""}`] : []),
        ]} />
      </div>
      <ScheduleBoard slots={board} days={days} today={today} />
      <div className="hidden print:block"><DocFooter /></div>
    </>
  );
}
