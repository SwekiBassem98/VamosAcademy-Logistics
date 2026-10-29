import Link from "next/link";
import { Forbidden, LinkButton } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { DocHeader, DocFooter, DocPage } from "@/components/document";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { canAccessGroup } from "@/server/scope";
import { formatDate, formatMinutes, WEEKDAYS } from "@/lib/format";

export const metadata = { title: "Liste du groupe" };

export default async function GroupList({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  const user = await pageUser("students.read");
  if (!user) return <Forbidden />;
  const { group: id = "" } = await searchParams;
  if (!(await canAccessGroup(user, id))) return <Forbidden />;
  const g = await db.group.findUnique({
    where: { id },
    include: {
      level: true, subject: true, teacher: true, schoolYear: true, slots: { include: { room: true }, orderBy: [{ weekday: "asc" }, { startMin: "asc" }] },
      enrollments: { where: { status: "ACTIVE" }, include: { student: { include: { guardians: { include: { guardian: true }, orderBy: { isPayer: "desc" }, take: 1 } } } }, orderBy: { student: { lastName: "asc" } } },
    },
  });
  if (!g) return <Forbidden />;
  return (
    <>
      <div className="no-print mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-2">
        <Link href="/documents" className="inline-flex min-h-10 items-center text-sm font-medium text-muted hover:text-brand">← Documents</Link>
        <div className="flex gap-2"><LinkButton variant="secondary" prefetch={false} href={`/api/export/group?id=${g.id}&format=xlsx`}>Excel</LinkButton><PrintButton /></div>
      </div>
      <DocPage>
        <DocHeader title="Liste des élèves" reference={g.name} lines={[`${g.subject.name} · ${g.level.name}`, `Année ${g.schoolYear.label}`]} />
        <p className="mt-3 text-sm">Enseignant : <strong>{g.teacher ? `${g.teacher.lastName} ${g.teacher.firstName}` : "—"}</strong> · Horaires : {g.slots.map((s) => `${WEEKDAYS[s.weekday]} ${formatMinutes(s.startMin)}–${formatMinutes(s.endMin)} (${s.room.name})`).join(" ; ") || "—"}</p>
        <table className="mt-4 w-full text-sm">
          <thead><tr className="border-b-2 border-navy text-left text-xs uppercase text-muted"><th className="py-1.5">N°</th><th>Matricule</th><th>Nom et prénom</th><th>Parent</th><th>Téléphone</th><th>Entrée</th></tr></thead>
          <tbody>
            {g.enrollments.map((e, i) => {
              const p = e.student.guardians[0]?.guardian;
              return <tr key={e.id} className="border-b border-line/60"><td className="py-1.5">{i + 1}</td><td className="font-mono text-xs">{e.student.code}</td><td className="font-medium">{e.student.lastName} {e.student.firstName}</td><td>{p ? `${p.lastName} ${p.firstName}` : "—"}</td><td>{p?.phone ?? "—"}</td><td>{formatDate(e.startDate)}</td></tr>;
            })}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">{g.enrollments.length} élève(s) / {g.capacity} places.</p>
        <DocFooter demo={g.isDemo} />
      </DocPage>
    </>
  );
}
