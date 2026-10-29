import Link from "next/link";
import { Forbidden } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { DocHeader, DocFooter, DocPage } from "@/components/document";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { canAccessGroup } from "@/server/scope";
import { formatMinutes, todayISO, WEEKDAYS } from "@/lib/format";

export const metadata = { title: "Feuille de présence" };
const CODE = { PRESENT: "P", ABSENT: "A", RETARD: "R", EXCUSE: "E" } as const;
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export default async function AttendanceSheet({ searchParams }: { searchParams: Promise<{ group?: string; month?: string; mode?: string }> }) {
  const user = await pageUser("attendance.read");
  if (!user) return <Forbidden />;
  const sp = await searchParams;
  const id = sp.group ?? "";
  if (!(await canAccessGroup(user, id))) return <Forbidden />;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : todayISO().slice(0, 7);
  const blank = sp.mode === "blank";
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1)), end = new Date(Date.UTC(y, m, 1));
  const g = await db.group.findUnique({
    where: { id },
    include: {
      teacher: true, subject: true, slots: true,
      enrollments: { where: { startDate: { lt: end }, OR: [{ endDate: null }, { endDate: { gte: start } }] }, include: { student: true }, orderBy: { student: { lastName: "asc" } } },
      sessions: { where: { date: { gte: start, lt: end } }, include: { records: true } },
    },
  });
  if (!g) return <Forbidden />;
  // Colonnes : jours de cours prévus du mois + séances exceptionnelles enregistrées
  const days = new Set<string>();
  for (let d = new Date(start); d < end; d = new Date(d.getTime() + 86400_000)) {
    const wd = ((d.getUTCDay() + 6) % 7) + 1;
    if (g.slots.some((s) => s.weekday === wd)) days.add(d.toISOString().slice(0, 10));
  }
  for (const s of g.sessions) days.add(s.date.toISOString().slice(0, 10));
  const cols = [...days].sort();
  const rec = (studentId: string, date: string) => g.sessions.find((s) => s.date.toISOString().slice(0, 10) === date)?.records.find((r) => r.studentId === studentId);

  return (
    <>
      <div className="no-print mx-auto mb-4 flex max-w-5xl justify-between">
        <Link href="/documents" className="text-sm text-muted hover:text-brand">← Documents</Link><PrintButton />
      </div>
      <DocPage wide>
        <DocHeader title="Feuille de présence" reference={g.name} lines={[`${MONTHS[m - 1]} ${y}`, g.teacher ? `${g.teacher.lastName} ${g.teacher.firstName}` : "", g.slots.map((s) => `${WEEKDAYS[s.weekday]} ${formatMinutes(s.startMin)}`).join(" · ")]} />
        <table className="mt-4 w-full border-collapse text-xs">
          <thead>
            <tr><th className="border border-gray-300 px-1 py-1 text-left">Élève</th>{cols.map((c) => <th key={c} className="w-9 border border-gray-300 px-0.5 py-1 text-center font-normal">{WEEKDAYS[((new Date(c).getUTCDay() + 6) % 7) + 1].slice(0, 2)}<br />{c.slice(8)}</th>)}
              {!blank && <th className="border border-gray-300 px-1">Abs.</th>}</tr>
          </thead>
          <tbody>
            {g.enrollments.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap border border-gray-300 px-1 py-1.5">{e.student.lastName} {e.student.firstName}</td>
                {cols.map((c) => { const r = blank ? undefined : rec(e.studentId, c); return <td key={c} className={`border border-gray-300 text-center ${r?.status === "ABSENT" ? "font-bold text-brand" : ""}`}>{r ? CODE[r.status] : ""}</td>; })}
                {!blank && <td className="border border-gray-300 text-center">{g.sessions.flatMap((s) => s.records).filter((r) => r.studentId === e.studentId && r.status === "ABSENT").length}</td>}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] text-muted">P = présent · A = absent · R = retard · E = excusé (justifié).{blank ? " Feuille vierge pour l'appel papier." : ""}</p>
        <div className="mt-6 text-right text-xs"><p className="ml-auto h-14 w-56 border-t border-dashed border-gray-400 pt-1 text-center">Signature de l&apos;enseignant</p></div>
        <DocFooter demo={g.isDemo} />
      </DocPage>
    </>
  );
}
