import Link from "next/link";
import type { PaymentMethod, Prisma } from "@prisma/client";
import { PageHeader, Table, Td, Badge, LinkButton, Forbidden, Stat } from "@/components/ui";
import { FilterBar, Pagination, SortLink, listParams, type Params } from "@/components/table-tools";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { can } from "@/lib/permissions";
import { formatDate, formatMoney, parseDay, todayISO } from "@/lib/format";
import { METHOD_LABEL } from "@/lib/labels";

export const metadata = { title: "Paiements" };
const PER = 30;
const isDay = (s?: string) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");

export default async function Payments({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await pageUser("payments.read");
  if (!user) return <Forbidden />;
  const params = await searchParams;
  const today = todayISO();
  const from = isDay(params.from) ? params.from! : `${today.slice(0, 8)}01`;
  const to = isDay(params.to) ? params.to! : today;
  const { q = "", method = "", state = "" } = params;
  const { sort, dir, page } = listParams(params, ["paidAt", "amount", "receiptNo"] as const, "paidAt", "desc");
  const where: Prisma.PaymentWhereInput = {
    paidAt: { gte: parseDay(from), lte: new Date(parseDay(to).getTime() + 12 * 3600_000) },
    ...(method in METHOD_LABEL ? { method: method as PaymentMethod } : {}),
    ...(state === "cancelled" ? { cancelledAt: { not: null } } : state === "valid" ? { cancelledAt: null } : {}),
    ...(q ? { OR: [{ receiptNo: { contains: q, mode: "insensitive" } }, { reference: { contains: q, mode: "insensitive" } }, { student: { OR: [{ lastName: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } }] } : {}),
  };
  const [total, payments, sums] = await Promise.all([
    db.payment.count({ where }),
    db.payment.findMany({ where, include: { student: true }, orderBy: [{ [sort]: dir }, { receiptNo: "desc" }], skip: (page - 1) * PER, take: PER }),
    db.payment.groupBy({ by: ["method"], where: { ...where, cancelledAt: null }, _sum: { amount: true }, _count: true }),
  ]);
  const totalValid = sums.reduce((s, m) => s + (m._sum.amount ?? 0), 0);
  const base = "/payments";

  return (
    <>
      <PageHeader title="Paiements" subtitle={`Du ${formatDate(parseDay(from))} au ${formatDate(parseDay(to))}`}
        actions={<>
          <LinkButton variant="secondary" prefetch={false} href={`/api/export/payments?from=${from}&to=${to}`}>Exporter CSV</LinkButton>
          {can(user.role, "payments.write") && <LinkButton href="/payments/new">Encaisser</LinkButton>}
        </>} />
      <FilterBar params={params}>
        <label className="text-sm">Du <input type="date" name="from" defaultValue={from} className="input" /></label>
        <label className="text-sm">Au <input type="date" name="to" defaultValue={to} className="input" /></label>
        <input name="q" defaultValue={q} placeholder="Élève, n° de reçu, référence…" className="input w-full sm:w-56" aria-label="Rechercher" />
        <select name="method" defaultValue={method} className="input w-full sm:w-40" aria-label="Mode"><option value="">Tous modes</option>{Object.entries(METHOD_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        <select name="state" defaultValue={state} className="input w-full sm:w-36" aria-label="État"><option value="">Tous</option><option value="valid">Valides</option><option value="cancelled">Annulés</option></select>
      </FilterBar>
      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Total encaissé" tone="green" value={formatMoney(totalValid)} hint={`${sums.reduce((s, m) => s + m._count, 0)} reçu(s) valides`} />
        {Object.entries(METHOD_LABEL).map(([k, l]) => <Stat key={k} label={l} value={formatMoney(sums.find((m) => m.method === k)?._sum.amount ?? 0)} />)}
      </div>
      <Table head={[<SortLink key="r" base={base} params={params} field="receiptNo" label="Reçu" />, <SortLink key="d" base={base} params={params} field="paidAt" label="Date" />, "Élève", "Mode", <SortLink key="a" base={base} params={params} field="amount" label="Montant" />, ""]} empty={payments.length === 0}>
        {payments.map((p) => (
          <tr key={p.id} className={p.cancelledAt ? "text-muted" : "hover:bg-gray-50"}>
            <Td className="font-mono text-xs"><Link href={`/payments/${p.id}`} className="hover:text-brand">{p.receiptNo}</Link></Td>
            <Td>{formatDate(p.paidAt)}</Td>
            <Td><Link href={`/students/${p.studentId}`} className="hover:text-brand">{p.student.lastName} {p.student.firstName}</Link></Td>
            <Td>{METHOD_LABEL[p.method]}{p.reference && <span className="block text-xs text-muted">{p.reference}</span>}</Td>
            <Td className={p.cancelledAt ? "tabular-nums line-through" : "font-semibold tabular-nums"}>{formatMoney(p.amount)}</Td>
            <Td>{p.cancelledAt ? <Badge tone="red">annulé</Badge> : <Link href={`/payments/${p.id}`} className="text-xs text-brand">Reçu</Link>}</Td>
          </tr>
        ))}
      </Table>
      <Pagination base={base} params={params} page={page} total={total} perPage={PER} />
    </>
  );
}
