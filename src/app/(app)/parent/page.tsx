import Link from "next/link";
import { Users } from "lucide-react";
import { Badge, Card, EmptyState, Forbidden, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { childrenOf } from "@/server/scope";
import { getActiveYear, studentBalances } from "@/server/services/finance";
import { formatMoney } from "@/lib/format";
import { formatScore, weightedAverage } from "@/lib/grades";

export const metadata = { title: "Mes enfants" };

export default async function ParentHome() {
  const user = await requireUser();
  if (user.role !== "PARENT") return <Forbidden />;
  const year = await getActiveYear().catch(() => null);
  const children = await db.student.findMany({
    where: { ...childrenOf(user), status: { not: "ARCHIVE" } },
    include: {
      level: true,
      enrollments: { where: { status: "ACTIVE", ...(year ? { group: { schoolYearId: year.id } } : {}) }, include: { group: { include: { subject: true } } } },
      attendance: { where: { status: "ABSENT", ...(year ? { session: { group: { schoolYearId: year.id } } } : {}) }, select: { id: true } },
      grades: { where: year ? { assessment: { group: { schoolYearId: year.id } } } : {}, include: { assessment: true } },
    },
    orderBy: { firstName: "asc" },
  });
  const balances = year ? await studentBalances(children.map((c) => c.id), year.id) : new Map();
  return (
    <>
      <PageHeader title="Mes enfants" subtitle={year ? `Année scolaire ${year.label}` : undefined} />
      {children.length === 0 ? (
        <EmptyState icon={<Users />} title="Aucun enfant associé à ce compte" text="Votre compte n'est relié à aucun dossier d'élève pour le moment. Contactez le centre pour qu'il l'associe à votre enfant." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {children.map((c) => {
            const b = balances.get(c.id);
            const avg = weightedAverage(c.grades.map((g) => ({ score: g.score, maxScore: g.assessment.maxScore, coefficient: g.assessment.coefficient })));
            return (
              <Card key={c.id} title={<Link href={`/parent/${c.id}`} className="hover:text-brand">{c.firstName} {c.lastName}</Link>} description={c.level?.name ?? "Niveau non renseigné"}>
                <dl className="grid grid-cols-3 gap-3 text-sm">
                  <div><dt className="text-muted">Reste à payer</dt><dd className="font-semibold">{formatMoney(b?.remaining ?? 0)}</dd></div>
                  <div><dt className="text-muted">Absences</dt><dd className="font-semibold">{c.attendance.length}</dd></div>
                  <div><dt className="text-muted">Moyenne</dt><dd className="font-semibold">{avg == null ? "—" : `${formatScore(avg)} / 20`}</dd></div>
                </dl>
                {(b?.overdue ?? 0) > 0 && <p className="mt-3"><Badge tone="red">dont {formatMoney(b!.overdue)} en retard</Badge></p>}
                <p className="mt-3 text-sm text-ink-soft">{c.enrollments.map((e) => e.group.subject.name).join(" · ") || "Aucun cours en cours"}</p>
                <Link href={`/parent/${c.id}`} className="mt-3 inline-flex min-h-10 items-center text-sm font-semibold text-brand hover:underline">Voir le détail →</Link>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
