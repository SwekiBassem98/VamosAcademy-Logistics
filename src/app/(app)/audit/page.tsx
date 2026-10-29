import { PageHeader, Forbidden, Table, Td } from "@/components/ui";
import { FilterBar } from "@/components/table-tools";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { formatDateTime } from "@/lib/format";

export const metadata = { title: "Journal d'audit" };

export default async function Audit({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  if (!(await pageUser("audit.read"))) return <Forbidden />;
  const { q = "" } = await searchParams;
  const logs = await db.auditLog.findMany({
    where: q ? { OR: [{ action: { contains: q } }, { entity: { contains: q } }, { entityId: q }] } : {},
    include: { user: { select: { fullName: true } } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return (
    <>
      <PageHeader title="Journal d'audit" subtitle="200 derniers événements. Les entrées ne sont ni modifiables ni supprimables depuis l'application." />
      <FilterBar params={{ q }} keep={[]} search={<input name="q" type="search" defaultValue={q} placeholder="Action (payment.cancel), entité, identifiant…" className="input" aria-label="Filtrer le journal" />} />
      <Table head={["Action", "Date", "Utilisateur", "Entité", "Détails"]} empty={logs.length === 0} emptyText="Aucun événement." caption="Journal d'audit">
        {logs.map((l) => (
          <tr key={l.id} className="align-top">
            <Td cell="primary" className="font-mono text-sm font-semibold text-navy">{l.action}</Td>
            <Td>{formatDateTime(l.createdAt)}</Td>
            <Td>{l.user?.fullName ?? "Système"}</Td>
            <Td className="text-xs break-all">{l.entity}<span className="block text-muted">{l.entityId}</span></Td>
            <Td cell="wide" className="max-w-md font-mono text-[11px] text-muted">{l.details ? <details><summary className="inline-flex min-h-8 cursor-pointer items-center font-sans text-xs font-semibold text-brand">Voir</summary><pre className="mt-1 whitespace-pre-wrap break-all">{JSON.stringify(l.details, null, 1)}</pre></details> : ""}</Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
