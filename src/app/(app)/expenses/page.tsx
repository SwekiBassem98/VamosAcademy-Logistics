import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { Paperclip } from "lucide-react";
import { Card, PageHeader, Table, Td, Forbidden, Stat, LinkButton, DemoBadge, Badge } from "@/components/ui";
import { Form, Input, Select, Submit } from "@/components/form";
import { FilterBar, Pagination, href, listParams, SortLink, type Params } from "@/components/table-tools";
import { PersistFilters } from "@/components/persist-filters";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { paymentModes, modeOptions } from "@/server/modes";
import { expenseWhere } from "@/server/filters";
import { can } from "@/lib/permissions";
import { formatDate, formatMoney, parseDay, todayISO } from "@/lib/format";
import { createCategory, createExpense } from "./actions";

export const metadata = { title: "Dépenses" };
const PER = 30;

export default async function Expenses({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await pageUser("expenses.read");
  if (!user) return <Forbidden />;
  const params = await searchParams;
  const { where, from, to } = expenseWhere(params);
  const { sort, dir, page } = listParams(params, ["spentAt", "amount"] as const, "spentAt", "desc");
  const live: Prisma.ExpenseWhereInput = { ...where, cancelledAt: null };
  const [total, expenses, categories, modes, sum, byCat, missing] = await Promise.all([
    db.expense.count({ where }),
    db.expense.findMany({ where, include: { category: true, mode: true, _count: { select: { attachments: true } }, correctedBy: { select: { id: true } } }, orderBy: [{ [sort]: dir }, { createdAt: "desc" }], skip: (page - 1) * PER, take: PER }),
    db.expenseCategory.findMany({ orderBy: { name: "asc" } }),
    paymentModes(),
    db.expense.aggregate({ where: live, _sum: { amount: true }, _count: { _all: true } }),
    db.expense.groupBy({ by: ["categoryId"], where: live, _sum: { amount: true } }),
    db.expense.count({ where: { ...live, attachments: { none: {} }, teacherPayId: null } }),
  ]);
  const write = can(user.role, "expenses.write");
  const base = "/expenses";
  const qs = href("", { ...params, from, to, page: undefined });
  const topCat = [...byCat].sort((a, b) => (b._sum.amount ?? 0) - (a._sum.amount ?? 0))[0];

  return (
    <>
      <PersistFilters storageKey="expenses" />
      <PageHeader title="Dépenses" subtitle={`Du ${formatDate(parseDay(from))} au ${formatDate(parseDay(to))} · les dépenses annulées restent visibles mais ne sont pas comptées`}
        actions={<>
          <LinkButton variant="secondary" prefetch={false} href={`/api/export/expenses${qs}`}>CSV</LinkButton>
          <LinkButton variant="secondary" prefetch={false} href={`/api/export/expenses${qs}${qs ? "&" : "?"}format=xlsx`}>Excel</LinkButton>
        </>} />
      <FilterBar params={params}>
        <label className="text-sm">Du <input type="date" name="from" defaultValue={from} className="input w-40" /></label>
        <label className="text-sm">Au <input type="date" name="to" defaultValue={to} className="input w-40" /></label>
        <input name="q" defaultValue={params.q ?? ""} placeholder="Libellé, référence…" className="input w-full sm:w-48" aria-label="Rechercher" />
        <select name="category" defaultValue={params.category ?? ""} className="input w-full sm:w-48" aria-label="Catégorie"><option value="">Toutes catégories</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select name="mode" defaultValue={params.mode ?? ""} className="input w-full sm:w-40" aria-label="Moyen"><option value="">Tous moyens</option>{modes.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
        <select name="state" defaultValue={params.state ?? ""} className="input w-full sm:w-44" aria-label="État"><option value="">Toutes</option><option value="valid">Valides</option><option value="cancelled">Annulées / corrigées</option><option value="nodoc">Sans justificatif</option></select>
      </FilterBar>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Total de la période" tone="brand" value={formatMoney(sum._sum.amount ?? 0)} hint={`${sum._count._all} dépense(s) valide(s)`} />
        <Stat label="Premier poste" value={topCat ? categories.find((c) => c.id === topCat.categoryId)?.name ?? "—" : "—"} hint={topCat ? formatMoney(topCat._sum.amount ?? 0) : undefined} />
        <Stat label="Sans justificatif" value={missing} hint={missing ? "À compléter" : "Tout est justifié"} />
      </div>
      <Table head={[<SortLink key="d" base={base} params={params} field="spentAt" label="Date" />, "Catégorie", "Libellé", "Moyen", <SortLink key="a" base={base} params={params} field="amount" label="Montant" />, "Justif.", "État"]} empty={expenses.length === 0}>
        {expenses.map((e) => (
          <tr key={e.id} className={e.cancelledAt ? "text-muted" : "hover:bg-gray-50"}>
            <Td>{formatDate(e.spentAt)}</Td>
            <Td>{e.category.name}</Td>
            <Td className="whitespace-normal"><Link href={`/expenses/${e.id}`} className="font-medium hover:text-brand">{e.label}</Link>{e.isDemo && <DemoBadge />}</Td>
            <Td>{e.mode.label}{e.reference && <span className="block text-xs text-muted">{e.reference}</span>}</Td>
            <Td className={e.cancelledAt ? "tabular-nums line-through" : "font-semibold tabular-nums"}>{formatMoney(e.amount)}</Td>
            <Td>{e._count.attachments ? <span className="inline-flex items-center gap-1 text-emerald-700"><Paperclip className="size-3.5" />{e._count.attachments}</span> : e.teacherPayId ? <span className="text-xs text-muted">paie</span> : <Badge tone="amber">manquant</Badge>}</Td>
            <Td>{e.correctedBy ? <Badge tone="amber">corrigée</Badge> : e.cancelledAt ? <Badge tone="red">annulée</Badge> : e.correctsId ? <Badge tone="blue">correction</Badge> : <Badge tone="green">valide</Badge>}</Td>
          </tr>
        ))}
      </Table>
      <Pagination base={base} params={params} page={page} total={total} perPage={PER} />
      {write && (
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <Card title="Nouvelle dépense" className="lg:col-span-2">
            <Form action={createExpense} className="grid gap-4 sm:grid-cols-2" resetOnSuccess>
              <Select label="Catégorie *" name="categoryId" placeholder="Choisir…" options={categories.map((c) => ({ value: c.id, label: c.name }))} />
              <Input label="Libellé *" name="label" />
              <Input label="Montant (DT) *" name="amount" inputMode="decimal" placeholder="0,000" />
              <Select label="Moyen de paiement *" name="modeId" options={modeOptions(modes)} />
              <Input label="Référence (n° chèque, facture…)" name="reference" />
              <Input label="Date *" name="spentAt" type="date" defaultValue={todayISO()} max={todayISO()} />
              <Input label="Justificatifs (PDF, JPG, PNG — 5 Mo max.)" name="files" type="file" multiple accept="application/pdf,image/jpeg,image/png" wrapperClass="sm:col-span-2" />
              <div className="sm:col-span-2"><Submit>Enregistrer la dépense</Submit></div>
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
