import Link from "next/link";
import type { Assessment } from "@prisma/client";
import { Card, PageHeader, Forbidden, Table, Td, Badge, EmptyState, ApplyButton, CardLink } from "@/components/ui";
import { Form, FormActions, Input, Select, Submit } from "@/components/form";
import { ConfirmAction } from "@/components/confirm";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { groupScope } from "@/server/scope";
import { can } from "@/lib/permissions";
import { dayInput, formatDate, todayISO } from "@/lib/format";
import { weightedAverage, formatScore, KIND_LABEL } from "@/lib/grades";
import { saveAssessment, deleteAssessment, saveGrades } from "./actions";

export const metadata = { title: "Notes" };

function AssessmentFields({ groupId, a }: { groupId: string; a?: Assessment }) {
  return (
    <>
      <input type="hidden" name="groupId" value={groupId} />
      <Input label="Intitulé *" name="title" defaultValue={a?.title} placeholder="ex. Devoir de contrôle n°1" wrapperClass="col-span-full" />
      <Select label="Type" name="kind" defaultValue={a?.kind ?? "DEVOIR"} options={Object.entries(KIND_LABEL).map(([value, label]) => ({ value, label }))} />
      <Select label="Trimestre" name="term" defaultValue={String(a?.term ?? 1)} options={[1, 2, 3].map((t) => ({ value: String(t), label: `Trimestre ${t}` }))} />
      <Input label="Date *" name="date" type="date" defaultValue={a ? dayInput(a.date) : todayISO()} />
      <Input label="Coefficient" name="coefficient" type="number" inputMode="numeric" min={1} max={10} defaultValue={a?.coefficient ?? 1} />
      <Input label="Barème" name="maxScore" type="number" inputMode="numeric" min={1} max={100} defaultValue={a?.maxScore ?? 20} />
    </>
  );
}

export default async function Grades({ searchParams }: { searchParams: Promise<{ group?: string; a?: string; term?: string }> }) {
  const user = await pageUser("grades.read");
  if (!user) return <Forbidden />;
  const write = can(user.role, "grades.write");
  const sp = await searchParams;
  const term = ["1", "2", "3"].includes(sp.term ?? "") ? Number(sp.term) : null;
  const groups = await db.group.findMany({ where: { active: true, schoolYear: { active: true }, ...groupScope(user) }, include: { subject: true }, orderBy: { name: "asc" } });
  const group = sp.group ? groups.find((g) => g.id === sp.group) : undefined;
  if (sp.group && !group) return <Forbidden />;

  const [assessments, enrollments] = group
    ? await Promise.all([
        db.assessment.findMany({ where: { groupId: group.id, ...(term ? { term } : {}) }, include: { grades: true }, orderBy: { date: "asc" } }),
        db.enrollment.findMany({ where: { groupId: group.id, status: "ACTIVE" }, include: { student: true }, orderBy: { student: { lastName: "asc" } } }),
      ])
    : [[], []];
  const selected = assessments.find((a) => a.id === sp.a);
  const gradeOf = (a: (typeof assessments)[number], studentId: string) => a.grades.find((g) => g.studentId === studentId);
  const qs = (extra: Record<string, string | undefined>) => `/grades?${new URLSearchParams(Object.entries({ group: group?.id, term: term ? String(term) : undefined, ...extra }).filter(([, v]) => v) as [string, string][])}`;

  return (
    <>
      <PageHeader title="Notes & suivi pédagogique" subtitle="Évaluations par groupe, moyennes pondérées sur 20." />
      <form className="mb-6 grid gap-2 rounded-lg border border-line bg-white p-3 sm:grid-cols-[1fr_11rem_auto]" role="search" aria-label="Choisir le groupe">
        <select name="group" defaultValue={group?.id ?? ""} className="input" aria-label="Groupe">
          <option value="">Choisir un groupe…</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select name="term" defaultValue={term ? String(term) : ""} className="input" aria-label="Trimestre">
          <option value="">Toute l&apos;année</option>{[1, 2, 3].map((t) => <option key={t} value={t}>Trimestre {t}</option>)}
        </select>
        <ApplyButton>Afficher</ApplyButton>
      </form>

      {!group ? <EmptyState title="Sélectionnez un groupe" text={groups.length ? "Les évaluations et moyennes s'affichent par groupe." : "Aucun groupe actif accessible."} /> : (
        <div className="space-y-6">
          <Card title={`Relevé — ${group.name}${term ? ` · trimestre ${term}` : ""}`} description={assessments.length ? "Touchez une évaluation (en-tête de colonne) pour saisir ses notes. Faites défiler le tableau horizontalement si besoin." : undefined}>
            {assessments.length === 0 ? <p className="text-sm text-muted">Aucune évaluation{term ? " pour ce trimestre" : ""}.</p> : (
              <Table head={["Élève", ...assessments.map((a) => (
                <Link key={a.id} href={qs({ a: a.id })} aria-current={a.id === selected?.id ? "true" : undefined} className={a.id === selected?.id ? "inline-block py-1 text-brand underline underline-offset-4" : "inline-block py-1 hover:text-navy"} title={`${a.title} — ${formatDate(a.date)}`}>
                  {a.title.length > 14 ? `${a.title.slice(0, 14)}…` : a.title}<span className="block font-normal normal-case">/{a.maxScore} · c{a.coefficient}</span>
                </Link>
              )), "Moyenne /20"]} empty={enrollments.length === 0} mobile="scroll" stickyFirst caption={`Relevé de notes ${group.name}`}>
                {enrollments.map(({ student: s }) => {
                  const avg = weightedAverage(assessments.map((a) => ({ score: gradeOf(a, s.id)?.score ?? null, maxScore: a.maxScore, coefficient: a.coefficient })));
                  return (
                    <tr key={s.id}>
                      <Td className="whitespace-nowrap"><Link href={`/students/${s.id}`} className="font-medium hover:text-brand">{s.lastName} {s.firstName}</Link></Td>
                      {assessments.map((a) => <Td key={a.id} className="whitespace-nowrap tabular-nums">{formatScore(gradeOf(a, s.id)?.score)}</Td>)}
                      <Td className={`whitespace-nowrap font-semibold tabular-nums ${avg != null && avg < 10 ? "text-brand" : "text-navy"}`}>{formatScore(avg)}</Td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>

          <div className="grid gap-6 xl:grid-cols-3">
            <Card title={selected ? `Saisie — ${selected.title}` : "Saisie des notes"} className="xl:col-span-2">
              {!selected ? <p className="text-sm text-muted">Cliquez sur une évaluation dans le relevé pour saisir ou consulter ses notes.</p> : (
                <>
                  <p className="mb-3 text-xs text-muted">{KIND_LABEL[selected.kind]} · trimestre {selected.term} · {formatDate(selected.date)} · barème {selected.maxScore} · coefficient {selected.coefficient}. Laissez vide pour un élève absent / non noté.</p>
                  {write ? (
                    <Form action={saveGrades.bind(null, selected.id)} className="space-y-3">
                      <ul className="divide-y divide-line rounded-md border border-line">
                        {enrollments.map(({ student: s }) => {
                          const g = gradeOf(selected, s.id);
                          return (
                            <li key={s.id} className="grid grid-cols-[1fr_6rem] items-center gap-2 px-3 py-2.5 sm:grid-cols-[1fr_6rem_2fr]">
                              <label htmlFor={`g_${s.id}`} className="text-sm font-semibold">{s.lastName} {s.firstName}</label>
                              <input id={`g_${s.id}`} name={`g_${s.id}`} inputMode="decimal" enterKeyHint="next" autoComplete="off" defaultValue={g?.score != null ? String(g.score).replace(".", ",") : ""} placeholder={`/${selected.maxScore}`} className="input text-right tabular-nums" />
                              <input name={`c_${s.id}`} defaultValue={g?.comment ?? ""} placeholder="Appréciation" aria-label={`Appréciation pour ${s.firstName}`} className="input col-span-2 sm:col-span-1" />
                            </li>
                          );
                        })}
                      </ul>
                      <FormActions sticky><Submit>Enregistrer les notes</Submit></FormActions>
                    </Form>
                  ) : (
                    <Table head={["Élève", "Note", "Appréciation"]}>
                      {enrollments.map(({ student: s }) => { const g = gradeOf(selected, s.id); return <tr key={s.id}><Td cell="primary" className="font-semibold">{s.lastName} {s.firstName}</Td><Td cell="num">{formatScore(g?.score)}</Td><Td cell="wide" className="text-xs">{g?.comment}</Td></tr>; })}
                    </Table>
                  )}
                </>
              )}
            </Card>
            {write && (
              <Card title={selected ? "Modifier l'évaluation" : "Nouvelle évaluation"}>
                <Form key={selected?.id ?? "new"} action={saveAssessment.bind(null, selected?.id ?? null)} className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-2" resetOnSuccess={!selected}>
                  <AssessmentFields groupId={group.id} a={selected} />
                  <div className="col-span-full"><Submit className="max-sm:w-full">{selected ? "Enregistrer" : "Créer l'évaluation"}</Submit></div>
                </Form>
                {selected && (
                  <div className="mt-4 flex items-center justify-between border-t border-line pt-4">
                    <CardLink href={qs({})}>+ Nouvelle évaluation</CardLink>
                    <ConfirmAction action={deleteAssessment.bind(null, selected.id)} small label="Supprimer" title={`Supprimer « ${selected.title} » ?`} message={<>Les <Badge>{selected.grades.length}</Badge> note(s) saisie(s) seront supprimées.</>} />
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
      )}
    </>
  );
}
