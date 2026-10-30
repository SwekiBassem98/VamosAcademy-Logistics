import Link from "next/link";
import { notFound } from "next/navigation";
import { HeartPulse, Phone as PhoneIcon } from "lucide-react";
import { Badge, Card, DemoBadge, PageHeader, Phone, Stat } from "@/components/ui";
import type { CurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { studentScope } from "@/server/scope";
import { ATTENDANCE_LABEL } from "@/lib/labels";
import { weightedAverage, formatScore, KIND_LABEL } from "@/lib/grades";
import { formatDate } from "@/lib/format";
import { Initials } from "../../classes/class-card";

const ATT_TONE = { PRESENT: "green", ABSENT: "red", RETARD: "amber", EXCUSE: "blue" } as const;

/**
 * Fiche élève côté enseignant : uniquement ce qui sert en cours (classes communes, assiduité et notes dans SES classes,
 * remarque médicale et contact d'urgence). Ni matricule, ni adresse, ni finances, ni historique administratif.
 */
export async function TeacherStudent({ user, id }: { user: CurrentUser; id: string }) {
  const mine = { group: { teacherId: user.teacherId ?? "__aucun__" } };
  const s = await db.student.findFirst({
    where: { id, ...studentScope(user) },
    select: {
      id: true, firstName: true, lastName: true, fullNameAr: true, className: true, school: true, medicalNotes: true, isDemo: true,
      level: { select: { name: true } },
      guardians: { orderBy: { isPayer: "desc" }, take: 2, select: { relation: true, guardian: { select: { firstName: true, lastName: true, phone: true } } } },
      enrollments: { where: { status: "ACTIVE", ...mine }, select: { startDate: true, group: { select: { id: true, name: true, subject: { select: { name: true, color: true } } } } } },
    },
  });
  if (!s) notFound();
  const [attendance, grades] = await Promise.all([
    db.attendanceRecord.findMany({ where: { studentId: id, session: mine }, include: { session: { select: { date: true, group: { select: { name: true } } } } }, orderBy: { session: { date: "desc" } }, take: 30 }),
    db.grade.findMany({ where: { studentId: id, assessment: { ...mine, group: { ...mine.group, schoolYear: { active: true } } } }, include: { assessment: { select: { title: true, kind: true, date: true, maxScore: true, coefficient: true, group: { select: { name: true } } } } }, orderBy: { assessment: { date: "desc" } } }),
  ]);
  const present = attendance.filter((a) => a.status === "PRESENT" || a.status === "RETARD").length;
  const avg = weightedAverage(grades.map((g) => ({ score: g.score, maxScore: g.assessment.maxScore, coefficient: g.assessment.coefficient })));
  const color = s.enrollments[0]?.group.subject.color;
  const firstClass = s.enrollments[0]?.group;

  return (
    <>
      <PageHeader
        back={firstClass ? { href: `/classes/${firstClass.id}`, label: firstClass.name } : { href: "/classes", label: "Mes classes" }}
        title={<span className="flex items-center gap-3"><Initials first={s.firstName} last={s.lastName} color={color} /><span className="min-w-0">{s.lastName} {s.firstName}{s.isDemo && <DemoBadge />}</span></span>}
        subtitle={<>{s.level?.name ?? "Niveau non renseigné"}{s.className && ` · ${s.className}`}{s.school && ` · ${s.school}`}{s.fullNameAr && <span dir="rtl" lang="ar" className="ml-2">{s.fullNameAr}</span>}</>}
        meta={s.enrollments.map((e) => <Badge key={e.group.id} tone="blue">{e.group.name}</Badge>)}
      />

      {s.medicalNotes && (
        <div role="note" className="mb-5 flex gap-3 rounded-lg border border-danger-600/25 bg-danger-50 p-4 text-sm text-danger-700">
          <HeartPulse aria-hidden className="mt-0.5 size-5 shrink-0" />
          <div><p className="font-bold">Remarque médicale</p><p className="mt-0.5 whitespace-pre-line">{s.medicalNotes}</p></div>
        </div>
      )}

      <div className="mb-5 grid grid-cols-2 gap-3 sm:mb-6 sm:gap-4 lg:grid-cols-3">
        <Stat label="Assiduité dans mes cours" value={attendance.length ? `${Math.round((present / attendance.length) * 100)} %` : "—"} hint={`${attendance.filter((a) => a.status === "ABSENT").length} absence(s) sur ${attendance.length} séance(s)`} />
        <Stat label="Moyenne dans mes cours" value={avg == null ? "—" : `${formatScore(avg)} / 20`} hint={`${grades.length} note(s) cette année`} />
        <div className="col-span-2 min-w-0 rounded-lg border border-line bg-white p-3.5 shadow-xs sm:p-4 lg:col-span-1">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-muted"><PhoneIcon aria-hidden className="size-3.5" />Contact en cas d&apos;urgence</p>
          {s.guardians.length === 0 ? <p className="mt-1.5 text-sm text-muted">Non renseigné : contactez l&apos;administration.</p> : (
            <ul className="mt-1.5 space-y-1 text-sm">
              {s.guardians.map((g, i) => <li key={i} className="flex flex-wrap items-center gap-x-2"><span className="text-ink">{g.guardian.firstName} {g.guardian.lastName} <span className="text-muted">({g.relation})</span></span><Phone value={g.guardian.phone} /></li>)}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-5 sm:gap-6 lg:grid-cols-2">
        <Card title="Notes dans mes cours" flush>
          {grades.length === 0 ? <p className="px-4 py-5 text-sm text-muted sm:px-5">Aucune note cette année.</p> : (
            <ul className="divide-y divide-line text-sm">
              {grades.map((g) => (
                <li key={g.id} className="flex min-h-12 items-center gap-3 px-4 py-2 sm:px-5">
                  <span className="min-w-0 flex-1"><span className="block truncate font-medium text-ink">{g.assessment.title}</span>
                    <span className="block truncate text-xs text-muted">{KIND_LABEL[g.assessment.kind]} · {formatDate(g.assessment.date)} · {g.assessment.group.name}</span>
                    {g.comment && <span className="mt-0.5 block text-xs italic text-muted">« {g.comment} »</span>}</span>
                  <span className="font-semibold tabular-nums text-navy">{g.score == null ? "abs." : `${formatScore(g.score)}/${g.assessment.maxScore}`}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Présences dans mes cours" flush>
          {attendance.length === 0 ? <p className="px-4 py-5 text-sm text-muted sm:px-5">Aucun appel enregistré.</p> : (
            <ul className="divide-y divide-line text-sm">
              {attendance.map((a) => (
                <li key={a.id} className="flex min-h-12 items-center gap-3 px-4 py-2 sm:px-5">
                  <span className="min-w-0 flex-1"><span className="block font-medium text-ink">{formatDate(a.session.date)}</span><span className="block truncate text-xs text-muted">{a.session.group.name}{a.note && ` · ${a.note}`}</span></span>
                  <Badge tone={ATT_TONE[a.status]}>{ATTENDANCE_LABEL[a.status]}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      <p className="mt-6 text-xs text-muted">Une information à corriger (classe, contact, remarque) ? Signalez-la à l&apos;administration. <Link href="/classes" className="font-medium text-brand hover:underline">Retour à mes classes</Link></p>
    </>
  );
}
