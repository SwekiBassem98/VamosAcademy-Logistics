import Link from "next/link";
import { Forbidden } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { DocHeader, DocFooter, DocPage } from "@/components/document";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { canAccessGroup } from "@/server/scope";
import { weightedAverage, formatScore } from "@/lib/grades";

export const metadata = { title: "Synthèse pédagogique" };

export default async function Pedagogy({ searchParams }: { searchParams: Promise<{ group?: string; term?: string }> }) {
  const user = await pageUser("grades.read");
  if (!user) return <Forbidden />;
  const sp = await searchParams;
  const id = sp.group ?? "";
  if (!(await canAccessGroup(user, id))) return <Forbidden />;
  const term = ["1", "2", "3"].includes(sp.term ?? "") ? Number(sp.term) : null;
  const g = await db.group.findUnique({
    where: { id },
    include: {
      teacher: true, subject: true, level: true, schoolYear: true,
      enrollments: { where: { status: "ACTIVE" }, include: { student: true }, orderBy: { student: { lastName: "asc" } } },
      assessments: { where: term ? { term } : {}, include: { grades: true }, orderBy: { date: "asc" } },
      sessions: { include: { records: true } },
    },
  });
  if (!g) return <Forbidden />;
  const rows = g.enrollments.map(({ student: s }) => {
    const avg = weightedAverage(g.assessments.map((a) => ({ score: a.grades.find((x) => x.studentId === s.id)?.score ?? null, maxScore: a.maxScore, coefficient: a.coefficient })));
    const recs = g.sessions.flatMap((x) => x.records).filter((r) => r.studentId === s.id);
    const present = recs.filter((r) => r.status === "PRESENT" || r.status === "RETARD").length;
    const lastComment = g.assessments.flatMap((a) => a.grades.filter((x) => x.studentId === s.id && x.comment).map((x) => ({ d: a.date, c: x.comment! }))).sort((a, b) => +b.d - +a.d)[0]?.c;
    return { s, avg, rate: recs.length ? Math.round((present / recs.length) * 100) : null, absences: recs.filter((r) => r.status === "ABSENT").length, lastComment };
  });
  const avgs = rows.map((r) => r.avg).filter((v): v is number => v != null);
  const classAvg = avgs.length ? Math.round((avgs.reduce((a, b) => a + b, 0) / avgs.length) * 100) / 100 : null;

  return (
    <>
      <div className="no-print mx-auto mb-4 flex max-w-5xl flex-wrap items-center justify-between gap-2">
        <Link href="/documents" className="inline-flex min-h-10 items-center text-sm font-medium text-muted hover:text-brand">← Documents</Link><PrintButton />
      </div>
      <DocPage wide>
        <DocHeader title="Synthèse pédagogique" reference={g.name} lines={[`${g.subject.name} · ${g.level.name}`, term ? `Trimestre ${term}` : `Année ${g.schoolYear.label}`, g.teacher ? `${g.teacher.lastName} ${g.teacher.firstName}` : ""]} />
        <p className="mt-3 text-sm">{g.assessments.length} évaluation(s) · moyenne du groupe : <strong>{formatScore(classAvg)} / 20</strong> · {g.sessions.length} séance(s) pointée(s)</p>
        <table className="mt-3 w-full text-sm">
          <thead><tr className="border-b-2 border-navy text-left text-xs uppercase text-muted"><th className="py-1.5">Élève</th>{g.assessments.map((a) => <th key={a.id} className="text-center font-normal">{a.title.slice(0, 12)}<br />/{a.maxScore} c{a.coefficient}</th>)}<th className="text-right">Moy. /20</th><th className="text-right">Assiduité</th><th className="text-right">Abs.</th><th className="pl-3">Dernière appréciation</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.s.id} className="border-b border-line/60 align-top">
                <td className="whitespace-nowrap py-1.5 font-medium">{r.s.lastName} {r.s.firstName}</td>
                {g.assessments.map((a) => <td key={a.id} className="text-center tabular-nums">{formatScore(a.grades.find((x) => x.studentId === r.s.id)?.score)}</td>)}
                <td className={`text-right font-semibold tabular-nums ${r.avg != null && r.avg < 10 ? "text-brand" : ""}`}>{formatScore(r.avg)}</td>
                <td className="text-right tabular-nums">{r.rate == null ? "—" : `${r.rate} %`}</td>
                <td className="text-right tabular-nums">{r.absences}</td>
                <td className="pl-3 text-xs">{r.lastComment ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <DocFooter demo={g.isDemo} />
      </DocPage>
    </>
  );
}
