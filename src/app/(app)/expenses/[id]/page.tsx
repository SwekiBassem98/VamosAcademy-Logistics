import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { Card, PageHeader, Forbidden, Badge, DemoBadge } from "@/components/ui";
import { Form, Input, Select, Submit } from "@/components/form";
import { ConfirmAction } from "@/components/confirm";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { paymentModes, modeOptions } from "@/server/modes";
import { can } from "@/lib/permissions";
import { dayInput, formatDate, formatDateTime, formatMoney, moneyInput, todayISO } from "@/lib/format";
import { attachToExpense, cancelExpense, correctExpense } from "../actions";

export const metadata = { title: "Dépense" };

export default async function ExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser("expenses.read");
  if (!user) return <Forbidden />;
  const { id } = await params;
  const e = await db.expense.findUnique({
    where: { id },
    include: {
      category: true, mode: true, attachments: { orderBy: { createdAt: "asc" } }, teacherPay: { include: { teacher: true } },
      corrects: { include: { attachments: true } }, correctedBy: { select: { id: true, label: true } },
    },
  });
  if (!e) notFound();
  const write = can(user.role, "expenses.write") && !e.cancelledAt && !e.teacherPayId;
  const [categories, modes, author] = await Promise.all([
    write ? db.expenseCategory.findMany({ orderBy: { name: "asc" } }) : [],
    write ? paymentModes() : [],
    e.createdById ? db.user.findUnique({ where: { id: e.createdById }, select: { fullName: true } }) : null,
  ]);
  const docs = [...e.attachments, ...(e.corrects?.attachments ?? [])];

  return (
    <>
      <PageHeader title={e.label} subtitle={<>{e.category.name} · {formatDate(e.spentAt)} · {e.mode.label}{e.reference && ` (${e.reference})`}</>} />
      <div className="mb-6 flex flex-wrap gap-2">
        <Badge tone={e.cancelledAt ? "red" : "green"}>{e.correctedBy ? "corrigée" : e.cancelledAt ? "annulée" : "valide"}</Badge>
        <Badge>{formatMoney(e.amount)}</Badge>
        {e.isDemo && <DemoBadge />}
        {e.teacherPay && <Badge tone="blue">Paie {e.teacherPay.period} — {e.teacherPay.teacher.lastName}</Badge>}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Détail & traçabilité">
          <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Montant</dt><dd className={e.cancelledAt ? "line-through" : "font-semibold"}>{formatMoney(e.amount)}</dd>
            <dt className="text-muted">Saisie</dt><dd>{formatDateTime(e.createdAt)} par {author?.fullName ?? "—"}</dd>
            {e.corrects && <><dt className="text-muted">Corrige</dt><dd><Link className="text-brand" href={`/expenses/${e.corrects.id}`}>{e.corrects.label} ({formatMoney(e.corrects.amount)})</Link></dd></>}
            {e.cancelledAt && <><dt className="text-muted">Annulée le</dt><dd>{formatDateTime(e.cancelledAt)} — {e.cancelReason}</dd></>}
            {e.correctedBy && <><dt className="text-muted">Remplacée par</dt><dd><Link className="text-brand" href={`/expenses/${e.correctedBy.id}`}>{e.correctedBy.label}</Link></dd></>}
          </dl>
        </Card>
        <Card title={`Justificatifs (${docs.length})`}>
          {docs.length === 0 ? <p className="text-sm text-amber-700">Aucun justificatif joint.</p> : (
            <ul className="space-y-2 text-sm">
              {docs.map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-2">
                  <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-brand hover:underline"><FileText className="size-4" />{a.fileName}</a>
                  <span className="text-xs text-muted">{Math.ceil(a.size / 1024)} Ko · {formatDate(a.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
          {can(user.role, "expenses.write") && !e.cancelledAt && (
            <Form action={attachToExpense.bind(null, e.id)} className="mt-4 flex flex-wrap items-end gap-2 border-t border-line pt-4" resetOnSuccess>
              <Input label="Ajouter (PDF, JPG, PNG — 5 Mo max.)" name="files" type="file" multiple accept="application/pdf,image/jpeg,image/png" wrapperClass="flex-1" />
              <Submit variant="secondary">Joindre</Submit>
            </Form>
          )}
        </Card>
        {write && (
          <>
            <Card title="Corriger cette dépense">
              <p className="mb-3 text-xs text-muted">La dépense actuelle sera marquée « corrigée » (conservée) et remplacée par une nouvelle dépense liée.</p>
              <Form action={correctExpense.bind(null, e.id)} className="grid gap-3 sm:grid-cols-2">
                <Select label="Catégorie *" name="categoryId" defaultValue={e.categoryId} options={categories.map((c) => ({ value: c.id, label: c.name }))} />
                <Input label="Libellé *" name="label" defaultValue={e.label} />
                <Input label="Montant (DT) *" name="amount" defaultValue={moneyInput(e.amount)} inputMode="decimal" />
                <Select label="Moyen *" name="modeId" defaultValue={e.modeId} options={modeOptions(modes)} />
                <Input label="Référence" name="reference" defaultValue={e.reference ?? ""} />
                <Input label="Date *" name="spentAt" type="date" defaultValue={dayInput(e.spentAt)} max={todayISO()} />
                <Input label="Motif de la correction *" name="reason" wrapperClass="sm:col-span-2" />
                <div className="sm:col-span-2"><Submit variant="secondary">Enregistrer la correction</Submit></div>
              </Form>
            </Card>
            <Card title="Annuler cette dépense">
              <p className="mb-3 text-sm text-muted">Elle restera visible (barrée) avec son motif et ne sera plus comptée dans les rapports.</p>
              <ConfirmAction action={cancelExpense.bind(null, e.id)} label="Annuler la dépense" title="Annuler cette dépense ?" withReason="Motif"
                message={<>{e.label} — <strong>{formatMoney(e.amount)}</strong>. L&apos;annulation est tracée.</>} confirmLabel="Annuler la dépense" />
            </Card>
          </>
        )}
      </div>
    </>
  );
}
