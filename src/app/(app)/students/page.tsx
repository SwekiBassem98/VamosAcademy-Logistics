import Link from "next/link";
import type { Prisma, StudentStatus } from "@prisma/client";
import { Download, UserPlus } from "lucide-react";
import { PageHeader, Table, Td, Badge, LinkButton, Forbidden, DemoBadge, EmptyState, Phone } from "@/components/ui";
import { SortLink, Pagination, FilterBar, listParams, type Params } from "@/components/table-tools";
import { Bulk, SelectAll, SelectRow } from "@/components/bulk";
import { PersistFilters } from "@/components/persist-filters";
import { archiveStudents } from "./actions";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { studentScope } from "@/server/scope";
import { studentBalances } from "@/server/services/finance";
import { can } from "@/lib/permissions";
import { formatMoney, formatDate } from "@/lib/format";
import { levelOptions, STATUS_LABEL, STATUS_TONE } from "./student-fields";

export const metadata = { title: "Élèves" };
const PER = 25;
const SORTS = ["lastName", "code", "createdAt", "level"] as const;

export default async function Students({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await pageUser("students.read");
  if (!user) return <Forbidden />;
  const params = await searchParams;
  const { q = "", level = "", status = "", group = "" } = params;
  const { sort, dir, page } = listParams(params, SORTS, "lastName");
  const finance = can(user.role, "payments.read");
  const year = await db.schoolYear.findFirst({ where: { active: true } });

  const where: Prisma.StudentWhereInput = {
    AND: [
      studentScope(user),
      status ? { status: status as StudentStatus } : { status: { not: "ARCHIVE" } },
      level ? { levelId: level } : {},
      group ? { enrollments: { some: { groupId: group, status: "ACTIVE" } } } : {},
      q ? {
        OR: [
          { firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } },
          { fullNameAr: { contains: q } }, { code: { contains: q, mode: "insensitive" } }, { phone: { contains: q } },
          { guardians: { some: { guardian: { phone: { contains: q } } } } },
        ],
      } : {},
    ],
  };
  const orderBy: Prisma.StudentOrderByWithRelationInput[] =
    sort === "level" ? [{ level: { order: dir } }, { lastName: "asc" }]
    : sort === "lastName" ? [{ lastName: dir }, { firstName: dir }]
    : [{ [sort]: dir }];

  const [total, students, levels, groups] = await Promise.all([
    db.student.count({ where }),
    db.student.findMany({
      where, orderBy, skip: (page - 1) * PER, take: PER,
      include: { level: true, guardians: { include: { guardian: true }, orderBy: { isPayer: "desc" }, take: 1 }, enrollments: { where: { status: "ACTIVE" }, include: { group: { select: { name: true } } } } },
    }),
    levelOptions(db),
    db.group.findMany({ where: { schoolYearId: year?.id ?? "", active: true, ...(user.role === "ENSEIGNANT" ? { teacherId: user.teacherId ?? "" } : {}) }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const balances = finance && year ? await studentBalances(students.map((s) => s.id), year.id) : null;
  const base = "/students";
  const write = can(user.role, "students.write");
  const msgTemplate = can(user.role, "messages.write") ? await db.messageTemplate.findFirst({ where: { code: "BIENVENUE", active: true } }) : null;
  const head = [
    ...(write ? [<SelectAll key="sel" />] : []),
    <SortLink key="c" base={base} params={params} field="code" label="Matricule" />,
    <SortLink key="n" base={base} params={params} field="lastName" label="Élève" />,
    <SortLink key="l" base={base} params={params} field="level" label="Niveau" />,
    "Statut", "Groupes", "Parent",
    ...(balances ? ["Solde dû"] : []),
    <SortLink key="d" base={base} params={params} field="createdAt" label="Créé le" />,
  ];

  return (
    <>
      <PageHeader
        title="Élèves"
        subtitle={`${total} dossier(s)${status ? "" : " (hors archivés)"}`}
        primary={write && <LinkButton href="/students/new"><UserPlus /> Nouvel élève</LinkButton>}
        actions={write && <LinkButton href={`/api/export/students${status ? `?status=${status}` : ""}`} variant="secondary" prefetch={false}><Download /> Exporter CSV</LinkButton>}
      />
      <PersistFilters storageKey="students" />
      <FilterBar params={params}
        search={<input name="q" type="search" defaultValue={q} placeholder="Nom, matricule, téléphone…" className="input" aria-label="Rechercher un élève" />}>
        <select name="level" defaultValue={level} className="input md:w-56" aria-label="Niveau">
          <option value="">Tous niveaux</option>
          {levels.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
        </select>
        <select name="group" defaultValue={group} className="input md:w-52" aria-label="Groupe">
          <option value="">Tous groupes</option>
          {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <select name="status" defaultValue={status} className="input md:w-44" aria-label="Statut">
          <option value="">Dossiers en cours</option>
          {Object.entries(STATUS_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </FilterBar>
      {total === 0 && !q && !level && !status && !group ? (
        <EmptyState title="Aucun élève pour le moment" text="Créez le premier dossier pour commencer les inscriptions."
          action={write && <LinkButton href="/students/new">Nouvel élève</LinkButton>} />
      ) : (
        <>
          <Bulk noun="élève(s)"
            links={write ? [
              { label: "Exporter (CSV)", href: "/api/export/students" },
              { label: "Exporter (Excel)", href: "/api/export/students?format=xlsx" },
              ...(msgTemplate ? [{ label: "Message aux parents", href: "/messages/new" }] : []),
            ] : []}
            actions={write ? [{ label: "Archiver", action: archiveStudents, title: "Archiver les dossiers sélectionnés ?", message: "Les inscriptions en cours seront terminées et les mensualités futures non payées annulées ; l'historique est conservé", withReason: "Motif", variant: "danger" }] : []}>
          <Table head={head} empty={students.length === 0} emptyText="Aucun élève ne correspond à ces critères." caption="Liste des élèves">
            {students.map((s) => {
              const b = balances?.get(s.id);
              const g = s.guardians[0]?.guardian;
              return (
                <tr key={s.id} className="transition hover:bg-surface">
                  {write && <Td cell="select"><SelectRow id={s.id} label={`${s.lastName} ${s.firstName}`} /></Td>}
                  <Td cell="hide-sm" className="font-mono text-xs text-muted">{s.code}</Td>
                  <Td cell="primary">
                    <Link href={`/students/${s.id}`} className="font-semibold text-navy hover:text-brand">{s.lastName} {s.firstName}</Link>
                    <DemoBadge show={s.isDemo} />
                    <span className="block text-xs text-muted lg:hidden">{s.code}</span>
                    {s.fullNameAr && <span className="block text-xs text-muted" dir="rtl" lang="ar">{s.fullNameAr}</span>}
                  </Td>
                  <Td>{s.level?.name ?? "—"}{s.className && <span className="block text-xs text-muted">{s.className}</span>}</Td>
                  <Td><Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</Badge></Td>
                  <Td cell="wide" className="text-xs">{s.enrollments.map((e) => e.group.name).join(", ") || <span className="text-muted">—</span>}</Td>
                  <Td><Phone value={g?.phone} /></Td>
                  {balances && <Td cell="num">{b && b.remaining > 0 ? <span className={b.overdue > 0 ? "font-semibold text-brand" : ""}>{formatMoney(b.remaining)}</span> : <span className="text-success-600">0</span>}</Td>}
                  <Td cell="hide-sm" className="text-xs text-muted">{formatDate(s.createdAt)}</Td>
                </tr>
              );
            })}
          </Table>
          </Bulk>
          <Pagination base={base} params={params} page={page} total={total} perPage={PER} />
        </>
      )}
    </>
  );
}
