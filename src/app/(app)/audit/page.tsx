import { PageHeader, Forbidden, Table, Td } from "@/components/ui";
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
      <form className="mb-4 flex gap-2">
        <input name="q" defaultValue={q} placeholder="Action (payment.cancel), entité, identifiant…" className="input max-w-md" aria-label="Filtrer" />
        <button className="rounded-md bg-navy px-4 py-2 text-sm font-medium text-white">Filtrer</button>
      </form>
      <Table head={["Date", "Utilisateur", "Action", "Entité", "Détails"]} empty={logs.length === 0}>
        {logs.map((l) => (
          <tr key={l.id} className="align-top">
            <Td>{formatDateTime(l.createdAt)}</Td>
            <Td>{l.user?.fullName ?? "Système"}</Td>
            <Td className="font-mono text-xs">{l.action}</Td>
            <Td className="text-xs">{l.entity}<span className="block text-muted">{l.entityId}</span></Td>
            <Td className="max-w-md whitespace-pre-wrap break-all font-mono text-[11px] text-muted">{l.details ? JSON.stringify(l.details) : ""}</Td>
          </tr>
        ))}
      </Table>
    </>
  );
}
