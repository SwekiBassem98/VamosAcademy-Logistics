import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, PageHeader, Forbidden, Badge, DemoBadge, Phone } from "@/components/ui";
import { Sheet } from "@/components/sheet";
import { Form, Input, Select, Submit } from "@/components/form";
import { ConfirmAction } from "@/components/confirm";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { can } from "@/lib/permissions";
import { formatMinutes, WEEKDAYS } from "@/lib/format";
import { TeacherForm, payLabel } from "../teacher-form";
import { addAvailability, deleteAvailability } from "../actions";


export const metadata = { title: "Enseignant" };

export default async function TeacherPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser("teachers.read");
  if (!user) return <Forbidden />;
  const write = can(user.role, "teachers.write");
  const { id } = await params;
  const t = await db.teacher.findUnique({
    where: { id },
    include: {
      subjects: { include: { subject: true } }, cycles: { include: { cycle: true } },
      availability: { orderBy: [{ weekday: "asc" }, { startMin: "asc" }] },
      groups: {
        where: { active: true, schoolYear: { active: true } },
        include: { level: true, subject: true, slots: { include: { room: true } }, _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!t) notFound();
  const slots = t.groups.flatMap((g) => g.slots.map((s) => ({ ...s, group: g }))).sort((a, b) => a.weekday - b.weekday || a.startMin - b.startMin);
  const weeklyMin = slots.reduce((m, s) => m + s.endMin - s.startMin, 0);

  return (
    <>
      <PageHeader back={{ href: "/teachers", label: "Enseignants" }} title={`${t.lastName} ${t.firstName}`}
        subtitle={<><Phone value={t.phone} />{t.email && ` · ${t.email}`}{write && ` · ${payLabel(t)}`}</>}
        meta={<>
          <Badge tone={t.active ? "green" : "gray"} dot>{t.active ? "actif" : "inactif"}</Badge>
          {t.isDemo && <DemoBadge />}
          {t.subjects.map((s) => <Badge key={s.subjectId} tone="blue">{s.subject.name}</Badge>)}
          {t.cycles.map((c) => <Badge key={c.cycleId}>{c.cycle.name}</Badge>)}
          <Badge tone="amber">{(weeklyMin / 60).toLocaleString("fr-FR")} h / semaine</Badge>
        </>}
        actions={write && <Sheet trigger="Modifier la fiche" variant="secondary" title="Modifier la fiche"><TeacherForm t={t} /></Sheet>} />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card title="Groupes affectés (année active)">
            {t.groups.length === 0 ? <p className="text-sm text-muted">Aucun groupe. L&apos;affectation se fait dans la fiche du groupe.</p> : (
              <ul className="divide-y divide-line text-sm">
                {t.groups.map((g) => (
                  <li key={g.id} className="flex flex-wrap items-center justify-between gap-x-3 py-2.5">
                    {can(user.role, "academics.read") ? <Link href={`/academics/groups/${g.id}`} className="font-medium hover:text-brand">{g.name}</Link> : <span className="font-medium">{g.name}</span>}
                    <span className="text-muted">{g.subject.name} · {g.level.name} · {g._count.enrollments}/{g.capacity} élèves</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Emploi du temps hebdomadaire">
            {slots.length === 0 ? <p className="text-sm text-muted">Aucun créneau.</p> : (
              <ul className="space-y-1 text-sm">
                {slots.map((s) => <li key={s.id} className="flex gap-3"><strong className="w-20 shrink-0">{WEEKDAYS[s.weekday]}</strong><span><span className="font-semibold tabular-nums">{formatMinutes(s.startMin)}–{formatMinutes(s.endMin)}</span> · {s.group.name} · {s.room.name}</span></li>)}
              </ul>
            )}
          </Card>
        </div>
        <Card title="Disponibilités">
          <p className="mb-3 text-xs text-muted">Si des disponibilités sont déclarées, aucun cours ne peut être programmé en dehors.</p>
          {t.availability.length === 0 && <p className="text-sm text-muted">Non déclarées (aucune contrainte).</p>}
          <ul className="space-y-2 text-sm">
            {t.availability.map((a) => (
              <li key={a.id} className="flex items-center justify-between rounded border border-line px-3 py-1.5">
                <span><strong>{WEEKDAYS[a.weekday]}</strong> {formatMinutes(a.startMin)}–{formatMinutes(a.endMin)}</span>
                {write && <ConfirmAction action={deleteAvailability.bind(null, a.id)} small variant="secondary" label="Retirer" title="Retirer cette disponibilité ?" message="Les cours déjà programmés ne sont pas modifiés." />}
              </li>
            ))}
          </ul>
          {write && (
            <Form action={addAvailability.bind(null, t.id)} className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4" resetOnSuccess>
              <Select label="Jour" name="weekday" wrapperClass="col-span-2" options={WEEKDAYS.slice(1).map((d, i) => ({ value: String(i + 1), label: d }))} />
              <Input label="De" name="start" type="time" step={900} defaultValue="14:00" />
              <Input label="À" name="end" type="time" step={900} defaultValue="18:00" />
              <Submit variant="secondary">Ajouter</Submit>
            </Form>
          )}
        </Card>
      </div>
    </>
  );
}
