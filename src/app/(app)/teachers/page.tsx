import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { UserPlus } from "lucide-react";
import { PageHeader, Table, Td, Badge, Forbidden, DemoBadge, Phone } from "@/components/ui";
import { Sheet } from "@/components/sheet";
import { SortLink, FilterBar, listParams, Pagination, type Params } from "@/components/table-tools";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { can } from "@/lib/permissions";
import { TeacherForm, payLabel } from "./teacher-form";

export const metadata = { title: "Enseignants" };
const PER = 25;

export default async function Teachers({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await pageUser("teachers.read");
  if (!user) return <Forbidden />;
  const params = await searchParams;
  const { q = "", subject = "", active = "1" } = params;
  const { sort, dir, page } = listParams(params, ["lastName", "createdAt"] as const, "lastName");
  const where: Prisma.TeacherWhereInput = {
    ...(active === "1" ? { active: true } : active === "0" ? { active: false } : {}),
    ...(subject ? { subjects: { some: { subjectId: subject } } } : {}),
    ...(q ? { OR: [{ lastName: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } : {}),
  };
  const [total, teachers, subjects] = await Promise.all([
    db.teacher.count({ where }),
    db.teacher.findMany({
      where, orderBy: sort === "lastName" ? [{ lastName: dir }, { firstName: dir }] : { createdAt: dir }, skip: (page - 1) * PER, take: PER,
      include: { subjects: { include: { subject: true } }, cycles: { include: { cycle: true } }, availability: true, _count: { select: { groups: { where: { active: true, schoolYear: { active: true } } } } } },
    }),
    db.subject.findMany({ orderBy: { name: "asc" } }),
  ]);
  const base = "/teachers";
  return (
    <>
      <PageHeader title="Enseignants" subtitle={`${total} enseignant(s)`}
        primary={can(user.role, "teachers.write") && <Sheet trigger={<><UserPlus /> Nouvel enseignant</>} title="Nouvel enseignant"><TeacherForm /></Sheet>} />
      <FilterBar params={params}
        search={<input name="q" type="search" defaultValue={q} placeholder="Nom ou téléphone…" className="input" aria-label="Rechercher un enseignant" />}>
        <select name="subject" defaultValue={subject} className="input md:w-56" aria-label="Matière">
          <option value="">Toutes matières</option>
          {subjects.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <select name="active" defaultValue={active} className="input md:w-40" aria-label="Statut">
          <option value="1">Actifs</option><option value="0">Inactifs</option><option value="all">Tous</option>
        </select>
      </FilterBar>
      <Table head={[<SortLink key="n" base={base} params={params} field="lastName" label="Nom" />, "Téléphone", "Matières", "Niveaux", "Groupes", "Disponibilités", "Rémunération", "Statut"]} empty={teachers.length === 0} emptyText="Aucun enseignant ne correspond." caption="Enseignants">
        {teachers.map((t) => (
          <tr key={t.id} className="transition hover:bg-surface">
            <Td cell="primary"><Link href={`/teachers/${t.id}`} className="font-semibold text-navy hover:text-brand">{t.lastName} {t.firstName}</Link><DemoBadge show={t.isDemo} /></Td>
            <Td><Phone value={t.phone} /></Td>
            <Td cell="wide">{t.subjects.map((s) => s.subject.name).join(", ") || "—"}</Td>
            <Td className="text-xs lg:whitespace-normal">{t.cycles.map((c) => c.cycle.name).join(", ") || "—"}</Td>
            <Td>{t._count.groups}</Td>
            <Td className="text-xs">{t.availability.length ? `${t.availability.length} plage(s)` : <span className="text-muted">non déclarées</span>}</Td>
            <Td className="text-xs">{can(user.role, "teachers.write") || can(user.role, "dashboard.finance") ? payLabel(t) : "—"}</Td>
            <Td><Badge tone={t.active ? "green" : "gray"}>{t.active ? "actif" : "inactif"}</Badge></Td>
          </tr>
        ))}
      </Table>
      <Pagination base={base} params={params} page={page} total={total} perPage={PER} />
    </>
  );
}
