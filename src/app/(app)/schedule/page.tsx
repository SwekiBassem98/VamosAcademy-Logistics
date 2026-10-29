import Link from "next/link";
import { PageHeader, Forbidden } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { DocHeader, DocFooter } from "@/components/document";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { formatMinutes, WEEKDAYS } from "@/lib/format";

export const metadata = { title: "Emploi du temps" };

export default async function Schedule({ searchParams }: { searchParams: Promise<{ room?: string; teacher?: string; print?: string }> }) {
  const user = await pageUser("academics.read");
  if (!user) return <Forbidden />;
  const sp = await searchParams;
  const teacherId = user.role === "ENSEIGNANT" ? (user.teacherId ?? "__none__") : sp.teacher || undefined;
  const [slots, rooms, teachers] = await Promise.all([
    db.scheduleSlot.findMany({
      where: { group: { active: true, schoolYear: { active: true }, ...(teacherId ? { teacherId } : {}) }, ...(sp.room ? { roomId: sp.room } : {}) },
      include: { group: { include: { subject: true, teacher: true } }, room: true },
      orderBy: { startMin: "asc" },
    }),
    db.room.findMany({ orderBy: { name: "asc" } }),
    user.role === "ENSEIGNANT" ? [] : db.teacher.findMany({ where: { active: true }, orderBy: { lastName: "asc" } }),
  ]);
  const days = [1, 2, 3, 4, 5, 6, 7].filter((d) => d <= 6 || slots.some((s) => s.weekday === 7));

  return (
    <>
      <div className="no-print"><PageHeader title="Emploi du temps" subtitle="Créneaux hebdomadaires de l'année active. Les créneaux se gèrent depuis la fiche de chaque groupe." actions={<PrintButton auto={sp.print === "1"} />} /></div>
      <div className="mb-4 hidden print:block">
        <DocHeader title="Emploi du temps" lines={[
          ...(teacherId && teachers.length ? [`Enseignant : ${teachers.find((t) => t.id === teacherId)?.lastName ?? ""}`] : []),
          ...(sp.room ? [`Salle : ${rooms.find((r) => r.id === sp.room)?.name ?? ""}`] : []),
        ]} />
      </div>
      {user.role !== "ENSEIGNANT" && (
        <form className="no-print mb-4 flex flex-wrap gap-2">
          <select name="room" defaultValue={sp.room ?? ""} className="input w-48" aria-label="Salle">
            <option value="">Toutes les salles</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <select name="teacher" defaultValue={sp.teacher ?? ""} className="input w-56" aria-label="Enseignant">
            <option value="">Tous les enseignants</option>
            {teachers.map((t) => <option key={t.id} value={t.id}>{t.lastName} {t.firstName}</option>)}
          </select>
          <button className="rounded-md bg-navy px-4 py-2 text-sm font-medium text-white">Filtrer</button>
        </form>
      )}
      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {days.map((d) => {
          const daySlots = slots.filter((s) => s.weekday === d);
          return (
            <section key={d} className="rounded-lg border border-line bg-white">
              <h2 className="border-b border-line bg-navy px-3 py-2 text-sm font-semibold text-white first:rounded-t-lg">{WEEKDAYS[d]}</h2>
              <div className="space-y-2 p-2">
                {daySlots.length === 0 && <p className="px-1 py-3 text-xs text-muted">—</p>}
                {daySlots.map((s) => (
                  <Link key={s.id} href={`/academics/groups/${s.groupId}`} className="block rounded-md border-l-4 bg-gray-50 px-2 py-1.5 text-xs hover:bg-gray-100" style={{ borderLeftColor: s.group.subject.color }}>
                    <p className="font-mono font-semibold text-navy">{formatMinutes(s.startMin)}–{formatMinutes(s.endMin)}</p>
                    <p className="font-medium">{s.group.name}</p>
                    <p className="text-muted">{s.room.name}{s.group.teacher && ` · ${s.group.teacher.lastName}`}</p>
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
      <div className="hidden print:block"><DocFooter /></div>
    </>
  );
}
