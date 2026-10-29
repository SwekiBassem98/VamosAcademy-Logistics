import { Card, PageHeader, Table, Td, Forbidden } from "@/components/ui";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { formatMoney, formatPeriod } from "@/lib/format";

export const metadata = { title: "Rapports financiers" };

export default async function Reports() {
  if (!(await pageUser("reports.read"))) return <Forbidden />;
  const year = await db.schoolYear.findFirst({ where: { active: true } });
  if (!year) return <PageHeader title="Rapports financiers" subtitle="Aucune année active." />;

  const [payments, expenses, invoices] = await Promise.all([
    db.payment.findMany({ where: { schoolYearId: year.id, cancelledAt: null }, select: { amount: true, paidAt: true } }),
    db.expense.findMany({ where: { schoolYearId: year.id }, select: { amount: true, spentAt: true, category: { select: { name: true } } } }),
    db.invoice.findMany({ where: { enrollment: { group: { schoolYearId: year.id } } }, select: { amount: true, period: true } }),
  ]);
  const months = year.billingMonths;
  const key = (d: Date) => d.toISOString().slice(0, 7);
  const rows = months.map((m) => {
    const cashed = payments.filter((p) => key(p.paidAt) === m).reduce((s, p) => s + p.amount, 0);
    const spent = expenses.filter((e) => key(e.spentAt) === m).reduce((s, e) => s + e.amount, 0);
    const billed = invoices.filter((i) => i.period === m).reduce((s, i) => s + i.amount, 0);
    return { m, billed, cashed, spent, net: cashed - spent };
  });
  const totals = rows.reduce((t, r) => ({ billed: t.billed + r.billed, cashed: t.cashed + r.cashed, spent: t.spent + r.spent, net: t.net + r.net }), { billed: 0, cashed: 0, spent: 0, net: 0 });
  const byCategory = new Map<string, number>();
  for (const e of expenses) byCategory.set(e.category.name, (byCategory.get(e.category.name) ?? 0) + e.amount);
  const maxCat = Math.max(1, ...byCategory.values());

  return (
    <>
      <PageHeader title="Rapports financiers" subtitle={`Année scolaire ${year.label} — encaissements par date de paiement`} />
      <Table head={["Mois", "Facturé (mensualités)", "Encaissé", "Dépenses", "Solde"]}>
        {rows.map((r) => (
          <tr key={r.m}>
            <Td className="capitalize">{formatPeriod(r.m)}</Td>
            <Td className="tabular-nums">{formatMoney(r.billed)}</Td>
            <Td className="tabular-nums text-emerald-700">{formatMoney(r.cashed)}</Td>
            <Td className="tabular-nums">{formatMoney(r.spent)}</Td>
            <Td className={`font-semibold tabular-nums ${r.net < 0 ? "text-brand" : "text-navy"}`}>{formatMoney(r.net)}</Td>
          </tr>
        ))}
        <tr className="bg-gray-50 font-semibold">
          <Td>Total</Td><Td className="tabular-nums">{formatMoney(totals.billed)}</Td><Td className="tabular-nums">{formatMoney(totals.cashed)}</Td>
          <Td className="tabular-nums">{formatMoney(totals.spent)}</Td><Td className="tabular-nums">{formatMoney(totals.net)}</Td>
        </tr>
      </Table>
      <Card title="Dépenses par catégorie" className="mt-6">
        {byCategory.size === 0 ? <p className="text-sm text-muted">Aucune dépense.</p> : (
          <ul className="space-y-2">
            {[...byCategory.entries()].sort((a, b) => b[1] - a[1]).map(([name, v]) => (
              <li key={name} className="grid grid-cols-[160px_1fr_120px] items-center gap-3 text-sm">
                <span>{name}</span>
                <span className="h-2.5 rounded-full bg-gray-100"><span className="block h-full rounded-full bg-navy" style={{ width: `${(v / maxCat) * 100}%` }} /></span>
                <span className="text-right tabular-nums">{formatMoney(v)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
