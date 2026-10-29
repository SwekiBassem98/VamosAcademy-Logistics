import Link from "next/link";
import { Forbidden } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { DocHeader, DocFooter, DocPage } from "@/components/document";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { studentScope } from "@/server/scope";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Liste par niveau" };

export default async function LevelList({ searchParams }: { searchParams: Promise<{ level?: string }> }) {
  const user = await pageUser("students.read");
  if (!user) return <Forbidden />;
  const { level: id = "" } = await searchParams;
  const level = await db.level.findUnique({ where: { id }, include: { cycle: true } });
  if (!level) return <Forbidden />;
  const [students, year] = await Promise.all([
    db.student.findMany({
      where: { levelId: id, status: { in: ["ACTIF", "PREINSCRIT"] }, ...studentScope(user) },
      include: { enrollments: { where: { status: "ACTIVE" }, include: { group: true } }, guardians: { include: { guardian: true }, orderBy: { isPayer: "desc" }, take: 1 } },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
    db.schoolYear.findFirst({ where: { active: true } }),
  ]);
  return (
    <>
      <div className="no-print mx-auto mb-4 flex max-w-3xl justify-between">
        <Link href="/documents" className="text-sm text-muted hover:text-brand">← Documents</Link><PrintButton />
      </div>
      <DocPage>
        <DocHeader title="Liste des élèves par niveau" reference={level.name} lines={[level.cycle.name, `Année ${year?.label ?? "—"}`]} />
        <table className="mt-4 w-full text-sm">
          <thead><tr className="border-b-2 border-navy text-left text-xs uppercase text-muted"><th className="py-1.5">N°</th><th>Matricule</th><th>Nom et prénom</th><th>Classe / école</th><th>Naissance</th><th>Groupes</th><th>Tél. parent</th></tr></thead>
          <tbody>
            {students.map((s, i) => (
              <tr key={s.id} className="border-b border-line/60 align-top">
                <td className="py-1.5">{i + 1}</td><td className="font-mono text-xs">{s.code}</td><td className="font-medium">{s.lastName} {s.firstName}</td>
                <td className="text-xs">{[s.className, s.school].filter(Boolean).join(" — ") || "—"}</td><td>{formatDate(s.birthDate)}</td>
                <td className="text-xs">{s.enrollments.map((e) => e.group.name).join(", ") || "—"}</td><td>{s.guardians[0]?.guardian.phone ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-muted">{students.length} élève(s).</p>
        <DocFooter demo={students.some((s) => s.isDemo)} />
      </DocPage>
    </>
  );
}
