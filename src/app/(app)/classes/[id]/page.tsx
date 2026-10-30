import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ClipboardCheck, FileText, HeartPulse, NotebookPen, Printer } from "lucide-react";
import { Badge, Card, DemoBadge, EmptyState, Forbidden, LinkButton, PageHeader, Stat } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { canAccessGroup } from "@/server/scope";
import { weightedAverage, formatScore, KIND_LABEL } from "@/lib/grades";
import { formatDate, formatMinutes, todayISO, WEEKDAYS } from "@/lib/format";
import { Initials } from "../class-card";

export const metadata = { title: "Ma classe" };

const presentish = (s: string) => s === "PRESENT" || s === "RETARD";
const pct = (ok: number, n: number) => (n ? Math.round((ok / n) * 100) : null);

/**
 * Classe vue par l'enseignant : élèves (assiduité et moyenne dans CETTE classe), séances et évaluations.
 * Aucune donnée financière ni coordonnée complète ; le téléphone du parent reste sur la fiche élève (urgences).
 */
export default async function ClassPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (user.role !== "ENSEIGNANT") redirect(`/academics/groups/${id}`);
  if (!(await canAccessGroup(user, id))) return <Forbidden />;
  const g = await db.group.findUnique({
    where: { id },
    include: {
      subject: true, level: true, room: true, schoolYear: true,
      slots: { include: { room: true }, orderBy: [{ weekday: "asc" }, { startMin: "asc" }] },
      enrollments: {
        where: { status: "ACTIVE" },
        include: { student: { select: { id: true, firstName: true, lastName: true, className: true, school: true, medicalNotes: true, isDemo: true } } },
        orderBy: [{ student: { lastName: "asc" } }, { student: { firstName: "asc" } }],
      },
      sessions: { orderBy: { date: "desc" }, take: 60, include: { records: { select: { studentId: true, status: true } } } },
      assessments: { orderBy: { date: "desc" }, include: { grades: { select: { studentId: true, score: true } } } },
    },
  });
  if (!g) notFound();

  const today = todayISO();
  const month = today.slice(0, 7);
  const allRecs = g.sessions.flatMap((s) => s.records);
  const classAvg = weightedAverage(g.assessments.flatMap((a) => a.grades.map((gr) => ({ score: gr.score, maxScore: a.maxScore, coefficient: a.coefficient }))));
  const recentCut = g.sessions.slice(0, 4).map((s) => s.id);
  const roster = g.enrollments.map((e) => {
    const recs = g.sessions.flatMap((s) => s.records.filter((r) => r.studentId === e.studentId).map((r) => ({ ...r, sessionId: s.id })));
    const avg = weightedAverage(g.assessments.flatMap((a) => a.grades.filter((gr) => gr.studentId === e.studentId).map((gr) => ({ score: gr.score, maxScore: a.maxScore, coefficient: a.coefficient }))));
    return {
      ...e.student, since: e.startDate,
      rate: pct(recs.filter((r) => presentish(r.status)).length, recs.length),
      recentAbsences: recs.filter((r) => r.status === "ABSENT" && recentCut.includes(r.sessionId)).length,
      avg,
    };
  });
  const sessionToday = g.sessions.find((s) => todayISO(s.date) === today);

  return (
    <>
      <PageHeader
        back={{ href: "/classes", label: "Mes classes" }}
        title={g.name}
        subtitle={`${g.subject.name} · ${g.level.name} · Année ${g.schoolYear.label}`}
        meta={<>
          {g.slots.map((s) => <Badge key={s.id} tone="blue">{WEEKDAYS[s.weekday]} {formatMinutes(s.startMin)}–{formatMinutes(s.endMin)} · {s.room.name}</Badge>)}
          {g.isDemo && <DemoBadge />}
        </>}
        primary={<LinkButton href={`/attendance?group=${g.id}&date=${today}`}><ClipboardCheck /> {sessionToday ? "Revoir l'appel du jour" : "Faire l'appel"}</LinkButton>}
        actions={<LinkButton variant="secondary" href={`/grades?group=${g.id}`}><NotebookPen /> Notes</LinkButton>}
      />

      <div className="mb-5 grid grid-cols-2 gap-3 sm:mb-6 sm:gap-4 lg:grid-cols-4">
        <Stat label="Élèves" value={roster.length} hint={`${roster.filter((r) => r.medicalNotes).length} remarque(s) médicale(s)`} />
        <Stat label="Assiduité" value={allRecs.length ? `${pct(allRecs.filter((r) => presentish(r.status)).length, allRecs.length)} %` : "—"} hint={`${g.sessions.length} séance(s) pointée(s)`} />
        <Stat label="Moyenne de la classe" value={classAvg == null ? "—" : `${formatScore(classAvg)} / 20`} hint={`${g.assessments.length} évaluation(s)`} />
        <Stat label="Dernier appel" value={g.sessions[0] ? formatDate(g.sessions[0].date).slice(0, 5) : "—"} hint={g.sessions[0]?.topic ?? "aucun sujet noté"} />
      </div>

      <div className="grid gap-5 sm:gap-6 lg:grid-cols-3">
        <section aria-labelledby="eleves" className="min-w-0 lg:col-span-2">
          <h2 id="eleves" className="mb-3 font-display text-lg font-bold text-navy">Mes élèves</h2>
          {roster.length === 0 ? <EmptyState title="Aucun élève inscrit" text="Les inscriptions sont gérées par l'administration." /> : (
            <ul className="grid gap-2.5 sm:grid-cols-2">
              {roster.map((s) => (
                <li key={s.id}>
                  <Link href={`/students/${s.id}`} className="flex min-h-16 items-center gap-3 rounded-lg border border-line bg-white p-3 shadow-xs transition hover:border-navy-200 hover:shadow-sm">
                    <Initials first={s.firstName} last={s.lastName} color={g.subject.color} />
                    <span className="min-w-0 flex-1">
                      <span className="block line-clamp-2 break-words font-semibold text-ink">{s.lastName} {s.firstName}{s.isDemo && <DemoBadge />}</span>
                      <span className="block line-clamp-2 break-words text-xs text-muted">{[s.className, s.school].filter(Boolean).join(" · ") || "Classe non renseignée"}</span>
                      <span className="mt-1 flex flex-wrap gap-1">
                        <Badge tone={s.rate == null ? "gray" : s.rate >= 85 ? "green" : s.rate >= 70 ? "amber" : "red"}>{s.rate == null ? "pas d'appel" : `${s.rate} % présent`}</Badge>
                        {s.avg != null && <Badge tone="blue">moy. {formatScore(s.avg)}</Badge>}
                        {s.recentAbsences > 0 && <Badge tone="amber">{s.recentAbsences} abs. récente{s.recentAbsences > 1 ? "s" : ""}</Badge>}
                        {s.medicalNotes && <Badge tone="red"><HeartPulse aria-hidden className="size-3" /> médical</Badge>}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="min-w-0 space-y-5 sm:space-y-6">
          <Card title="Derniers appels" flush>
            {g.sessions.length === 0 ? <p className="px-4 py-5 text-sm text-muted sm:px-5">Aucun appel enregistré.</p> : (
              <ul className="divide-y divide-line text-sm">
                {g.sessions.slice(0, 6).map((s) => {
                  const absent = s.records.filter((r) => r.status === "ABSENT").length;
                  return (
                    <li key={s.id}>
                      <Link href={`/attendance?group=${g.id}&date=${todayISO(s.date)}`} className="flex min-h-12 items-center gap-3 px-4 py-2 hover:bg-surface sm:px-5">
                        <span className="min-w-0 flex-1"><span className="block font-medium text-ink">{WEEKDAYS[((s.date.getUTCDay() + 6) % 7) + 1]} {formatDate(s.date)}</span>{s.topic && <span className="block line-clamp-2 break-words text-xs text-muted">{s.topic}</span>}</span>
                        <Badge tone={absent ? "amber" : "green"}>{absent ? `${absent} absent${absent > 1 ? "s" : ""}` : "complet"}</Badge>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Évaluations" actions={<Link href={`/grades?group=${g.id}`} className="inline-flex min-h-10 items-center text-sm font-medium text-brand hover:underline">Saisir →</Link>} flush>
            {g.assessments.length === 0 ? <p className="px-4 py-5 text-sm text-muted sm:px-5">Aucune évaluation. Créez-en une depuis « Notes ».</p> : (
              <ul className="divide-y divide-line text-sm">
                {g.assessments.slice(0, 6).map((a) => {
                  const scored = a.grades.filter((gr) => gr.score != null);
                  const avg = weightedAverage(scored.map((gr) => ({ score: gr.score, maxScore: a.maxScore, coefficient: 1 })));
                  const complete = scored.length >= roster.length;
                  return (
                    <li key={a.id}>
                      <Link href={`/grades?group=${g.id}&a=${a.id}`} className="flex min-h-12 items-center gap-3 px-4 py-2 hover:bg-surface sm:px-5">
                        <span className="min-w-0 flex-1"><span className="block line-clamp-2 break-words font-medium text-ink">{a.title}</span><span className="text-xs text-muted">{KIND_LABEL[a.kind]} · {formatDate(a.date)} · T{a.term}</span></span>
                        <span className="text-right"><span className="block font-semibold tabular-nums text-navy">{avg == null ? "—" : `${formatScore(avg)}/20`}</span>
                          <span className={`text-xs ${complete ? "text-muted" : "font-semibold text-warning-700"}`}>{scored.length}/{roster.length} notes</span></span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card title="Imprimer">
            <div className="grid gap-2">
              <LinkButton variant="secondary" href={`/documents/group-list?group=${g.id}`}><Printer /> Liste des élèves</LinkButton>
              <LinkButton variant="secondary" href={`/documents/attendance-sheet?group=${g.id}&month=${month}&mode=blank`}><FileText /> Feuille d&apos;appel vierge du mois</LinkButton>
              <LinkButton variant="secondary" href={`/documents/pedagogy?group=${g.id}`}><NotebookPen /> Synthèse pédagogique</LinkButton>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
