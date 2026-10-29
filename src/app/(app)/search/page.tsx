import Link from "next/link";
import { Card, PageHeader, Badge, EmptyState } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { groupScope, studentScope } from "@/server/scope";
import { can } from "@/lib/permissions";

export const metadata = { title: "Recherche" };

export default async function Search({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const q = ((await searchParams).q ?? "").trim();
  if (q.length < 2) {
    return <><PageHeader title="Recherche" /><EmptyState title="Saisissez au moins 2 caractères" text="Nom, prénom, matricule, téléphone d'un parent, enseignant ou groupe." /></>;
  }
  const ci = { contains: q, mode: "insensitive" as const };
  const [students, guardians, teachers, groups] = await Promise.all([
    can(user.role, "students.read")
      ? db.student.findMany({
          where: { AND: [studentScope(user), { OR: [{ firstName: ci }, { lastName: ci }, { code: ci }, { fullNameAr: { contains: q } }, { phone: { contains: q } }, { guardians: { some: { guardian: { phone: { contains: q } } } } }] }] },
          include: { level: true }, take: 20, orderBy: { lastName: "asc" },
        })
      : [],
    can(user.role, "students.write")
      ? db.guardian.findMany({ where: { OR: [{ firstName: ci }, { lastName: ci }, { phone: { contains: q } }] }, include: { students: { include: { student: true } } }, take: 10 })
      : [],
    can(user.role, "teachers.read") ? db.teacher.findMany({ where: { OR: [{ firstName: ci }, { lastName: ci }, { phone: { contains: q } }] }, take: 10 }) : [],
    can(user.role, "academics.read") ? db.group.findMany({ where: { AND: [groupScope(user), { name: ci }] }, include: { schoolYear: true }, take: 10 }) : [],
  ]);
  const total = students.length + guardians.length + teachers.length + groups.length;

  return (
    <>
      <PageHeader title={`Résultats pour « ${q} »`} subtitle={`${total} résultat(s)`} />
      {total === 0 && <EmptyState title="Aucun résultat" text="Vérifiez l'orthographe ou cherchez par téléphone ou matricule." />}
      <div className="grid gap-6 lg:grid-cols-2">
        {students.length > 0 && (
          <Card title={`Élèves (${students.length})`}>
            <ul className="divide-y divide-line text-sm">
              {students.map((s) => (
                <li key={s.id} className="flex items-center justify-between py-2">
                  <Link href={`/students/${s.id}`} className="font-medium text-navy hover:text-brand">{s.lastName} {s.firstName}</Link>
                  <span className="flex items-center gap-2 text-xs text-muted">{s.level?.name}<span className="font-mono">{s.code}</span>{s.status === "ARCHIVE" && <Badge>archivé</Badge>}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {guardians.length > 0 && (
          <Card title={`Parents (${guardians.length})`}>
            <ul className="divide-y divide-line text-sm">
              {guardians.map((g) => (
                <li key={g.id} className="py-2">
                  <p className="font-medium">{g.lastName} {g.firstName} · <span className="text-muted">{g.phone}</span></p>
                  <p className="text-xs">{g.students.map((l) => <Link key={l.studentId} href={`/students/${l.studentId}`} className="mr-2 text-brand">{l.student.firstName} {l.student.lastName}</Link>)}</p>
                </li>
              ))}
            </ul>
          </Card>
        )}
        {teachers.length > 0 && (
          <Card title={`Enseignants (${teachers.length})`}>
            <ul className="divide-y divide-line text-sm">
              {teachers.map((t) => <li key={t.id} className="py-2"><Link href={`/teachers/${t.id}`} className="font-medium text-navy hover:text-brand">{t.lastName} {t.firstName}</Link> <span className="text-muted">· {t.phone}</span></li>)}
            </ul>
          </Card>
        )}
        {groups.length > 0 && (
          <Card title={`Groupes (${groups.length})`}>
            <ul className="divide-y divide-line text-sm">
              {groups.map((g) => <li key={g.id} className="py-2"><Link href={`/academics/groups/${g.id}`} className="font-medium text-navy hover:text-brand">{g.name}</Link> <span className="text-muted">· {g.schoolYear.label}</span></li>)}
            </ul>
          </Card>
        )}
      </div>
    </>
  );
}
