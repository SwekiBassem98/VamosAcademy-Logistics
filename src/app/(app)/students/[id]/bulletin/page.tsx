import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass, Forbidden } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { DocHeader, DocFooter, DocPage } from "@/components/document";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { studentScope } from "@/server/scope";
import { weightedAverage, formatScore, KIND_LABEL } from "@/lib/grades";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Bulletin" };

export default async function Bulletin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ term?: string }> }) {
  const user = await pageUser("grades.read");
  if (!user) return <Forbidden />;
  const { id } = await params;
  const sp = await searchParams;
  const term = ["1", "2", "3"].includes(sp.term ?? "") ? Number(sp.term) : null;
  const year = await db.schoolYear.findFirst({ where: { active: true } });
  const scope = user.role === "ENSEIGNANT" ? { teacherId: user.teacherId ?? "" } : {};
  const s = await db.student.findFirst({
    where: { id, ...studentScope(user) },
    include: {
      level: { include: { cycle: true } },
      enrollments: {
        where: { group: { schoolYearId: year?.id ?? "", ...scope } },
        include: { group: { include: { subject: true, teacher: true, assessments: { where: term ? { term } : {}, include: { grades: { where: { studentId: id } } }, orderBy: { date: "asc" } } } } },
      },
      attendance: { where: { session: { group: { schoolYearId: year?.id ?? "", ...scope } } }, select: { status: true } },
    },
  });
  if (!s) notFound();
  const subjects = s.enrollments.map((e) => {
    const g = e.group;
    const avg = weightedAverage(g.assessments.map((a) => ({ score: a.grades[0]?.score ?? null, maxScore: a.maxScore, coefficient: a.coefficient })));
    return { g, avg, comments: g.assessments.flatMap((a) => (a.grades[0]?.comment ? [a.grades[0].comment] : [])) };
  });
  const general = weightedAverage(subjects.filter((x) => x.avg != null).map((x) => ({ score: x.avg, maxScore: 20, coefficient: 1 })));
  const abs = s.attendance.filter((a) => a.status === "ABSENT").length;
  const exc = s.attendance.filter((a) => a.status === "EXCUSE").length;
  const late = s.attendance.filter((a) => a.status === "RETARD").length;

  return (
    <>
      <div className="no-print mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-2">
        <Link href={`/students/${s.id}`} className="inline-flex min-h-10 items-center text-sm font-medium text-muted hover:text-brand">← Dossier de l&apos;élève</Link>
        <div className="flex flex-wrap gap-2">
          <form className="flex gap-1"><select name="term" defaultValue={term ? String(term) : ""} className="input w-40" aria-label="Trimestre"><option value="">Toute l&apos;année</option><option value="1">Trimestre 1</option><option value="2">Trimestre 2</option><option value="3">Trimestre 3</option></select><button className={buttonClass({ variant: "navy" })}>OK</button></form>
          <PrintButton />
        </div>
      </div>
      <DocPage>
        <DocHeader title="Bulletin de suivi" reference={s.code} lines={[term ? `Trimestre ${term}` : "Année complète", `Année ${year?.label ?? "—"}`]} />
        <div className="mt-4 grid gap-2 sm:grid-cols-2 print:grid-cols-2">
          <p><span className="text-muted">Élève :</span> <strong>{s.lastName} {s.firstName}</strong></p>
          <p><span className="text-muted">Niveau :</span> {s.level ? `${s.level.cycle.name} — ${s.level.name}` : "—"}</p>
        </div>
        <table className="mt-4 w-full text-sm">
          <thead><tr className="border-b-2 border-navy text-left text-xs uppercase text-muted"><th className="py-1.5">Matière / groupe</th><th>Évaluations</th><th className="text-right">Moyenne /20</th><th className="pl-3">Appréciations</th></tr></thead>
          <tbody>
            {subjects.length === 0 && <tr><td colSpan={4} className="py-6 text-center text-muted">Aucune inscription pour cette année.</td></tr>}
            {subjects.map(({ g, avg, comments }) => (
              <tr key={g.id} className="border-b border-line/60 align-top">
                <td className="py-1.5"><strong>{g.subject.name}</strong><span className="block text-xs text-muted">{g.name}{g.teacher && ` — ${g.teacher.lastName}`}</span></td>
                <td className="text-xs">{g.assessments.map((a) => <span key={a.id} className="block">{formatDate(a.date)} · {KIND_LABEL[a.kind]} : {a.grades[0]?.score == null ? "abs." : `${formatScore(a.grades[0].score)}/${a.maxScore}`}</span>)}</td>
                <td className={`text-right text-base font-semibold tabular-nums ${avg != null && avg < 10 ? "text-brand" : "text-navy"}`}>{formatScore(avg)}</td>
                <td className="pl-3 text-xs">{comments.join(" · ")}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td colSpan={2} className="pt-3 text-right font-semibold">Moyenne générale (matières notées)</td><td className="pt-3 text-right text-lg font-bold text-brand tabular-nums">{formatScore(general)}</td><td /></tr></tfoot>
        </table>
        <p className="mt-4 text-sm">Assiduité : {s.attendance.length} séance(s) pointée(s) — {abs} absence(s) non justifiée(s), {exc} excusée(s), {late} retard(s).</p>
        <div className="mt-8 grid grid-cols-2 gap-4 text-center text-xs sm:gap-10">
          <p className="h-16 border-t border-dashed border-gray-400 pt-1">Signature du parent</p>
          <p className="h-16 border-t border-dashed border-gray-400 pt-1">Cachet de VAMOS ACADEMY</p>
        </div>
        <DocFooter demo={s.isDemo} />
      </DocPage>
    </>
  );
}
