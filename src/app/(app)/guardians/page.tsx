import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { PageHeader, Table, Td, Forbidden, DemoBadge, Phone } from "@/components/ui";
import { FilterBar, Pagination, SortLink, listParams, type Params } from "@/components/table-tools";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";

export const metadata = { title: "Parents" };
const PER = 30;

export default async function Guardians({ searchParams }: { searchParams: Promise<Params> }) {
  if (!(await pageUser("students.write"))) return <Forbidden />;
  const params = await searchParams;
  const { q = "" } = params;
  const { sort, dir, page } = listParams(params, ["lastName", "createdAt"] as const, "lastName");
  const where: Prisma.GuardianWhereInput = q
    ? { OR: [{ lastName: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }, { phone2: { contains: q } }] }
    : {};
  const [total, guardians] = await Promise.all([
    db.guardian.count({ where }),
    db.guardian.findMany({
      where, include: { students: { include: { student: true } } },
      orderBy: sort === "lastName" ? [{ lastName: dir }, { firstName: dir }] : { createdAt: dir },
      skip: (page - 1) * PER, take: PER,
    }),
  ]);
  const base = "/guardians";
  return (
    <>
      <PageHeader title="Parents & tuteurs" subtitle={`${total} contact(s). Les parents s'ajoutent et se modifient depuis le dossier de l'élève ; un même téléphone relie automatiquement les frères et sœurs.`} />
      <FilterBar params={params} submitLabel="Rechercher"
        search={<input name="q" type="search" defaultValue={q} placeholder="Nom ou téléphone…" className="input" aria-label="Rechercher un parent" />} />
      <Table head={[<SortLink key="n" base={base} params={params} field="lastName" label="Nom" />, "Téléphone", "Téléphone 2", "E-mail", "Enfants"]} empty={guardians.length === 0} emptyText="Aucun parent trouvé." caption="Parents et tuteurs">
        {guardians.map((g) => (
          <tr key={g.id}>
            <Td cell="primary" className="font-semibold text-navy">{g.lastName} {g.firstName}<DemoBadge show={g.isDemo} /></Td>
            <Td><Phone value={g.phone} /></Td>
            <Td><Phone value={g.phone2} /></Td>
            <Td className="break-all">{g.email ?? "—"}</Td>
            <Td cell="wide">
              {g.students.map(({ student: s, relation }) => (
                <Link key={s.id} href={`/students/${s.id}`} className="mr-3 inline-flex min-h-8 items-center text-brand hover:underline">{s.firstName} {s.lastName} <span className="text-muted">({relation})</span></Link>
              ))}
            </Td>
          </tr>
        ))}
      </Table>
      <Pagination base={base} params={params} page={page} total={total} perPage={PER} />
    </>
  );
}
