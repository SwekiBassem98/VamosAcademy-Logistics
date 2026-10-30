import Link from "next/link";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { CalendarDays, Plus } from "lucide-react";
import { buttonClass, Card, PageHeader, SectionTitle, Table, Td, Badge, Forbidden, DemoBadge, CardLink } from "@/components/ui";
import { Form, FormActions, Input, Select, Submit } from "@/components/form";
import { Sheet } from "@/components/sheet";
import { ConfirmAction } from "@/components/confirm";
import { FilterBar, SortLink, listParams, type Params } from "@/components/table-tools";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { groupScope } from "@/server/scope";
import { can } from "@/lib/permissions";
import { formatMinutes, formatMoney, WEEKDAYS } from "@/lib/format";
import { levelOptions } from "../students/student-fields";
import { GroupFields } from "./group-fields";
import { createGroup, createLevel, createSubject, saveRoom, deleteReference } from "./actions";

export const metadata = { title: "Groupes & cours" };

export default async function Academics({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await pageUser("academics.read");
  // Enseignant : ses élèves sont présentés classe par classe dans son espace
  if (user?.role === "ENSEIGNANT") redirect("/classes");
  if (!user) return <Forbidden />;
  const write = can(user.role, "academics.write");
  const params = await searchParams;
  const { q = "", subject = "", level = "", teacher = "", status = "active" } = params;
  const { sort, dir } = listParams(params, ["name", "fill", "fee"] as const, "name");
  const year = await db.schoolYear.findFirst({ where: { active: true } });
  const where: Prisma.GroupWhereInput = {
    AND: [
      groupScope(user),
      { schoolYearId: year?.id ?? "" },
      status === "active" ? { active: true } : status === "archived" ? { active: false } : {},
      subject ? { subjectId: subject } : {}, level ? { levelId: level } : {}, teacher ? { teacherId: teacher } : {},
      q ? { name: { contains: q, mode: "insensitive" } } : {},
    ],
  };
  const [groupsRaw, cycles, subjects, rooms, teachers, levels, roomSlots] = await Promise.all([
    db.group.findMany({
      where, orderBy: sort === "fee" ? { monthlyFee: dir } : { name: dir },
      include: { level: true, subject: true, teacher: true, slots: { orderBy: [{ weekday: "asc" }, { startMin: "asc" }] }, _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } },
    }),
    db.cycle.findMany({ include: { levels: { orderBy: { order: "asc" } } }, orderBy: { order: "asc" } }),
    db.subject.findMany({ orderBy: { name: "asc" } }),
    db.room.findMany({ orderBy: { name: "asc" } }),
    db.teacher.findMany({ where: { active: true }, orderBy: { lastName: "asc" } }),
    levelOptions(db),
    db.scheduleSlot.findMany({ where: { group: { schoolYearId: year?.id ?? "", active: true } }, select: { roomId: true, startMin: true, endMin: true } }),
  ]);
  const roomUse = (id: string) => roomSlots.filter((s) => s.roomId === id).reduce((m, s) => ({ n: m.n + 1, min: m.min + s.endMin - s.startMin }), { n: 0, min: 0 });
  const groups = sort === "fill"
    ? [...groupsRaw].sort((a, b) => (a._count.enrollments / a.capacity - b._count.enrollments / b.capacity) * (dir === "asc" ? 1 : -1))
    : groupsRaw;
  const base = "/academics";

  return (
    <>
      <PageHeader title="Groupes, salles & cours" subtitle={`Année ${year?.label ?? "—"} · un groupe = une matière, un niveau, un enseignant, un tarif mensuel`}
        primary={write && (
          <Sheet trigger={<><Plus /> Nouveau groupe</>} title="Nouveau groupe / cours" description="Les créneaux horaires s'ajoutent ensuite depuis la fiche du groupe.">
            <Form action={createGroup} className="space-y-4">
              <GroupFields />
              <FormActions><Submit>Créer le groupe</Submit></FormActions>
            </Form>
          </Sheet>
        )}
        actions={<LinkButtonSchedule />} />
      <FilterBar params={params}
        search={<input name="q" type="search" defaultValue={q} placeholder="Nom du groupe…" className="input" aria-label="Rechercher un groupe" />}>
        <select name="subject" defaultValue={subject} className="input md:w-44" aria-label="Matière"><option value="">Toutes matières</option>{subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
        <select name="level" defaultValue={level} className="input md:w-52" aria-label="Niveau"><option value="">Tous niveaux</option>{levels.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select>
        {<select name="teacher" defaultValue={teacher} className="input md:w-48" aria-label="Enseignant"><option value="">Tous enseignants</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.lastName} {t.firstName}</option>)}</select>}
        <select name="status" defaultValue={status} className="input md:w-36" aria-label="Statut"><option value="active">Actifs</option><option value="archived">Archivés</option><option value="all">Tous</option></select>
      </FilterBar>
      <Table head={[<SortLink key="n" base={base} params={params} field="name" label="Groupe" />, "Niveau", "Matière", "Enseignant", "Horaires", <SortLink key="f" base={base} params={params} field="fill" label="Remplissage" />, <SortLink key="m" base={base} params={params} field="fee" label="Mensualité" />]} empty={groups.length === 0} emptyText="Aucun groupe ne correspond à ces critères." caption="Groupes">
        {groups.map((g) => {
          const full = g._count.enrollments >= g.capacity;
          return (
            <tr key={g.id} className="transition hover:bg-surface">
              <Td cell="primary"><Link href={`/academics/groups/${g.id}`} className="font-semibold text-navy hover:text-brand">{g.name}</Link><DemoBadge show={g.isDemo} />{!g.active && <Badge className="ml-1.5">archivé</Badge>}</Td>
              <Td>{g.level.name}</Td>
              <Td><span className="mr-1.5 inline-block size-2 rounded-full" style={{ background: g.subject.color }} />{g.subject.name}</Td>
              <Td>{g.teacher ? `${g.teacher.lastName} ${g.teacher.firstName}` : <Badge tone="amber">à affecter</Badge>}</Td>
              <Td cell="wide" className="text-xs">{g.slots.map((s) => `${WEEKDAYS[s.weekday].slice(0, 3)}. ${formatMinutes(s.startMin)}`).join(" · ") || <span className="text-muted">aucun créneau</span>}</Td>
              <Td><Badge tone={full ? "red" : "blue"}>{g._count.enrollments}/{g.capacity}</Badge></Td>
              <Td cell="num">{formatMoney(g.monthlyFee)}</Td>
            </tr>
          );
        })}
      </Table>

      {write && (
        <>
          <SectionTitle>Référentiel : niveaux, matières et salles</SectionTitle>
          <div className="grid gap-6 lg:grid-cols-3">
            <Card title="Cycles & niveaux">
              <div className="max-h-80 space-y-3 overflow-y-auto text-sm">
                {cycles.map((c) => (
                  <div key={c.id}>
                    <p className="font-semibold text-navy">{c.name} <span className="text-muted" dir="rtl">{c.nameAr}</span></p>
                    <ul className="mt-1 flex flex-wrap gap-1">
                      {c.levels.map((l) => (
                        <li key={l.id} className="flex items-center gap-1 rounded-md bg-surface-2 py-0.5 pl-2.5 text-xs font-medium">{l.name}
                          <ConfirmAction action={deleteReference.bind(null, "level", l.id)} small variant="secondary" label="×" ariaLabel={`Supprimer le niveau ${l.name}`} title={`Supprimer le niveau « ${l.name} » ?`} message="Refusé si des groupes ou des élèves l'utilisent." />
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
              <Form action={createLevel} className="mt-4 space-y-3 border-t border-line pt-4" resetOnSuccess>
                <Select label="Cycle" name="cycleId" options={cycles.map((c) => ({ value: c.id, label: c.name }))} />
                <Input label="Nouveau niveau" name="name" placeholder="ex. Bac Sport" />
                <Submit variant="secondary">Ajouter</Submit>
              </Form>
            </Card>
            <Card title="Matières">
              <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
                {subjects.map((s) => (
                  <li key={s.id} className="flex min-h-11 items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-2"><span className="size-2.5 rounded-full" style={{ background: s.color }} />{s.name} <span className="font-mono text-xs text-muted">{s.code}</span></span>
                    <ConfirmAction action={deleteReference.bind(null, "subject", s.id)} small variant="secondary" label="Supprimer" title={`Supprimer la matière « ${s.name} » ?`} message="Refusé si des groupes l'utilisent." />
                  </li>
                ))}
              </ul>
              <Form action={createSubject} className="mt-4 grid grid-cols-3 items-end gap-3 border-t border-line pt-4" resetOnSuccess>
                <Input label="Code" name="code" placeholder="HIST" />
                <Input label="Nom" name="name" wrapperClass="col-span-2" />
                <Input label="Couleur" name="color" type="color" defaultValue="#C1272D" />
                <div className="col-span-2 self-end"><Submit variant="secondary">Ajouter</Submit></div>
              </Form>
            </Card>
            <Card title="Salles" description="Occupation hebdomadaire de l'année active" actions={<CardLink href="/schedule">Planning →</CardLink>}>
              <ul className="divide-y divide-line text-sm">
                {rooms.map((r) => {
                  const u = roomUse(r.id);
                  return (
                  <li key={r.id} className="py-1">
                    <details>
                      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2">
                        <span><span className="font-semibold">{r.name}</span><span className="block text-xs text-muted">{r.capacity} places · {u.n} créneau(x) · {(u.min / 60).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} h / semaine</span></span>
                        <span className="text-xs font-semibold text-brand">Modifier</span>
                      </summary>
                      <p className="mb-2"><CardLink href={`/schedule?room=${r.id}`}>Emploi du temps de la salle →</CardLink></p>
                      <Form action={saveRoom.bind(null, r.id)} className="mb-2 grid grid-cols-2 gap-2 rounded-md border border-line p-2">
                        <Input label="Nom" name="name" defaultValue={r.name} />
                        <Input label="Capacité" name="capacity" type="number" inputMode="numeric" min={1} defaultValue={r.capacity} />
                        <Submit variant="secondary">Enregistrer</Submit>
                        <ConfirmAction action={deleteReference.bind(null, "room", r.id)} small label="Supprimer" title={`Supprimer ${r.name} ?`} message="Refusé si la salle est utilisée dans un emploi du temps." />
                      </Form>
                    </details>
                  </li>
                  );
                })}
              </ul>
              <Form action={saveRoom.bind(null, null)} className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-4" resetOnSuccess>
                <Input label="Nom" name="name" />
                <Input label="Capacité" name="capacity" type="number" inputMode="numeric" min={1} />
                <Submit variant="secondary">Ajouter</Submit>
              </Form>
            </Card>
          </div>
        </>
      )}
    </>
  );
}

function LinkButtonSchedule() {
  return <Link href="/schedule" className={buttonClass({ variant: "secondary" })}><CalendarDays /> Emploi du temps</Link>;
}
