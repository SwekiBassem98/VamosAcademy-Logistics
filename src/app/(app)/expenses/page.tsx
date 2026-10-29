import { Card, PageHeader, Table, Td, Forbidden, Stat, LinkButton, DemoBadge } from "@/components/ui";
import { Form, Input, Select, Submit } from "@/components/form";
import { ConfirmAction } from "@/components/confirm";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { can } from "@/lib/permissions";
import { formatDate, formatMoney, todayISO } from "@/lib/format";
import { METHOD_LABEL } from "@/lib/labels";
import { createCategory, createExpense, deleteExpense } from "./actions";

export const metadata = { title: "Dépenses" };

export default async function Expenses({ searchParams }: { searchParams: Promise<{ month?: string; category?: string }> }) {
  const user = await pageUser("expenses.read");
  if (!user) return <Forbidden />;
  const sp = await searchParams;
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : todayISO().slice(0, 7);
  const [y, m] = month.split("-").map(Number);
  const start = new Date(Date.UTC(y, m - 1, 1));
  const end = new Date(Date.UTC(y, m, 1));
  const [expenses, categories] = await Promise.all([
    db.expense.findMany({ where: { spentAt: { gte: start, lt: end }, ...(sp.category ? { categoryId: sp.category } : {}) }, include: { category: true }, orderBy: { spentAt: "desc" } }),
    db.expenseCategory.findMany({ orderBy: { name: "asc" } }),
  ]);
  const write = can(user.role, "expenses.write");
  const total = expenses.reduce((s, e) => s + e.amount, 0);

  return (
    <>
      <PageHeader title="Dépenses" subtitle={`Mois : ${month}`}
        actions={<LinkButton variant="secondary" prefetch={false} href={`/api/export/expenses?month=${month}`}>Exporter CSV</LinkButton>} />
      <form className="mb-4 flex items-end gap-2">
        <label className="text-sm">Mois <input type="month" name="month" defaultValue={month} className="input" /></label>
        <select name="category" defaultValue={sp.category ?? ""} className="input w-48" aria-label="Catégorie"><option value="">Toutes catégories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <button className="rounded-md bg-navy px-4 py-2 text-sm font-medium text-white">Afficher</button>
      </form>
      <div className="mb-4 grid gap-3 sm:grid-cols-3"><Stat label="Total du mois" tone="brand" value={formatMoney(total)} hint={`${expenses.length} dépense(s)`} /></div>
      <Table head={["Date", "Catégorie", "Libellé", "Mode", "Montant", ""]} empty={expenses.length === 0}>
        {expenses.map((e) => (
          <tr key={e.id}>
            <Td>{formatDate(e.spentAt)}</Td>
            <Td>{e.category.name}</Td>
            <Td className="whitespace-normal">{e.label}{e.isDemo && <DemoBadge />}</Td>
            <Td>{METHOD_LABEL[e.method]}</Td>
            <Td className="font-semibold tabular-nums">{formatMoney(e.amount)}</Td>
            <Td>{write && <ConfirmAction action={deleteExpense.bind(null, e.id)} small label="Supprimer" title="Supprimer cette dépense ?" message={<>{e.label} — <strong>{formatMoney(e.amount)}</strong>. La suppression est tracée dans le journal d&apos;audit.</>} />}</Td>
          </tr>
        ))}
      </Table>
      {write && (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Card title="Nouvelle dépense" className="lg:col-span-2">
            <Form action={createExpense} className="grid gap-4 sm:grid-cols-2" resetOnSuccess>
              <Select label="Catégorie *" name="categoryId" placeholder="Choisir…" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
              <Input label="Libellé *" name="label" />
              <Input label="Montant (DT) *" name="amount" inputMode="decimal" />
              <Select label="Mode" name="method" options={Object.entries(METHOD_LABEL).map(([value, label]) => ({ value, label }))} />
              <Input label="Date *" name="spentAt" type="date" defaultValue={todayISO()} />
              <div className="self-end"><Submit>Enregistrer</Submit></div>
            </Form>
          </Card>
          <Card title="Catégories">
            <p className="mb-3 text-sm text-muted">{categories.map((c) => c.name).join(" · ")}</p>
            <Form action={createCategory} className="flex items-end gap-2" resetOnSuccess>
              <Input label="Nouvelle catégorie" name="name" wrapperClass="flex-1" />
              <Submit variant="secondary">Ajouter</Submit>
            </Form>
          </Card>
        </div>
      )}
    </>
  );
}
