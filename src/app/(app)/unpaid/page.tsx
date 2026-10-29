import Link from "next/link";
import { PageHeader, Table, Td, Badge, Forbidden, LinkButton, Stat } from "@/components/ui";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { unpaidSummary } from "@/server/services/finance";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata = { title: "Impayés" };

export default async function Unpaid() {
  if (!(await pageUser("payments.read"))) return <Forbidden />;
  const year = await db.schoolYear.findFirst({ where: { active: true } });
  const rows = year ? await unpaidSummary(year.id) : [];
  const total = rows.reduce((s, r) => s + r.due, 0);
  return (
    <>
      <PageHeader title="Impayés" subtitle={`Échéances échues non réglées — année ${year?.label ?? "—"}`}
        actions={<LinkButton variant="secondary" prefetch={false} href="/api/export/unpaid">Exporter CSV</LinkButton>} />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Total impayé" tone="brand" value={formatMoney(total)} />
        <Stat label="Élèves concernés" value={rows.length} />
      </div>
      <Table head={["Élève", "Parent / téléphone", "Échéances", "Plus ancienne", "Montant dû", ""]} empty={rows.length === 0}>
        {rows.map(({ student: s, due, count, oldest }) => {
          const g = s.guardians[0]?.guardian;
          const tel = g?.phone.replace(/\s/g, "");
          const msg = encodeURIComponent(`Bonjour, VAMOS ACADEMY vous informe qu'un montant de ${formatMoney(due)} reste dû pour ${s.firstName}. Merci de passer au centre. Tél. 20 807 657`);
          return (
            <tr key={s.id}>
              <Td><Link href={`/students/${s.id}`} className="font-medium text-navy hover:text-brand">{s.lastName} {s.firstName}</Link></Td>
              <Td>{g ? <>{g.lastName} {g.firstName} · <a href={`tel:${tel}`}>{g.phone}</a></> : <span className="text-muted">aucun parent</span>}</Td>
              <Td><Badge tone="red">{count}</Badge></Td>
              <Td>{formatDate(oldest)}</Td>
              <Td className="font-semibold tabular-nums">{formatMoney(due)}</Td>
              <Td className="space-x-3 text-xs">
                <Link href={`/payments/new?student=${s.id}`} className="text-brand">Encaisser</Link>
                {tel && <a href={`https://wa.me/216${tel}?text=${msg}`} target="_blank" rel="noreferrer" className="text-emerald-700">Rappel WhatsApp</a>}
              </Td>
            </tr>
          );
        })}
      </Table>
    </>
  );
}
