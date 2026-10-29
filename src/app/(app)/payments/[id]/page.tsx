import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { Card, Forbidden, Badge, LinkButton } from "@/components/ui";
import { Form, Input, Select, Submit } from "@/components/form";
import { ConfirmAction } from "@/components/confirm";
import { PrintButton } from "@/components/print-button";
import { DocHeader, DocFooter } from "@/components/document";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { paymentModes, modeOptions } from "@/server/modes";
import { can } from "@/lib/permissions";
import { dayInput, formatDate, formatDateTime, formatMoney, formatPeriod, moneyInput } from "@/lib/format";
import { cancelPayment, correctPayment } from "../actions";

export const metadata = { title: "Reçu" };

export default async function Receipt({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> }) {
  const user = await pageUser("payments.read");
  if (!user) return <Forbidden />;
  const { id } = await params;
  const { print } = await searchParams;
  const p = await db.payment.findUnique({
    where: { id },
    include: {
      mode: true, student: { include: { level: true } }, schoolYear: true,
      corrects: { select: { id: true, receiptNo: true, amount: true } }, correctedBy: { select: { id: true, receiptNo: true } },
      allocations: { include: { invoice: { include: { enrollment: { include: { group: true } } } } } },
    },
  });
  if (!p) notFound();
  const [cashier, modes] = await Promise.all([
    p.createdById ? db.user.findUnique({ where: { id: p.createdById }, select: { fullName: true } }) : null,
    can(user.role, "payments.cancel") && !p.cancelledAt ? paymentModes() : [],
  ]);

  return (
    <div className="mx-auto max-w-2xl">
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-2">
        <Link href="/payments" className="inline-flex min-h-10 items-center gap-1 text-sm font-medium text-muted hover:text-brand"><ArrowLeft className="size-4" aria-hidden /> Paiements</Link>
        <div className="flex gap-2">
          <LinkButton variant="secondary" prefetch={false} href={`/api/receipts/${p.id}/pdf`}><Download className="size-4" /> PDF</LinkButton>
          <PrintButton auto={print === "1" && !p.cancelledAt} />
        </div>
      </div>

      <article className="relative overflow-hidden rounded-lg border border-line bg-white p-4 shadow-xs sm:p-8 print:border-0 print:p-0 print:shadow-none">
        {p.cancelledAt && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-6xl font-black text-red-600/20 -rotate-12">{p.correctedBy ? "CORRIGÉ" : "ANNULÉ"}</div>}
        <DocHeader title="REÇU DE PAIEMENT" reference={p.receiptNo} lines={[formatDate(p.paidAt), `Année ${p.schoolYear.label}`]} />
        <section className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <p><span className="text-muted">Élève :</span> <strong>{p.student.lastName} {p.student.firstName}</strong></p>
          <p><span className="text-muted">Matricule :</span> {p.student.code}</p>
          <p><span className="text-muted">Niveau :</span> {p.student.level?.name ?? "—"}</p>
          <p><span className="text-muted">Moyen :</span> {p.mode.label}{p.reference && ` — ${p.reference}`}</p>
        </section>
        <table className="mt-5 w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs uppercase text-muted"><th className="py-1.5">Désignation</th><th className="py-1.5 text-right">Montant</th></tr></thead>
          <tbody>
            {p.allocations.map((a) => (
              <tr key={a.id} className="border-b border-line/60">
                <td className="py-1.5 capitalize">{formatPeriod(a.invoice.period)}{a.invoice.months > 1 && ` (${a.invoice.months} mois)`} — {a.invoice.enrollment.group.name}</td>
                <td className="py-1.5 text-right tabular-nums">{formatMoney(a.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td className="pt-3 text-right font-semibold">Total payé</td><td className="pt-3 text-right text-lg font-bold text-brand tabular-nums">{formatMoney(p.amount)}</td></tr></tfoot>
        </table>
        {p.corrects && <p className="mt-3 text-xs text-muted">Ce reçu corrige et remplace le reçu {p.corrects.receiptNo}.</p>}
        {p.note && <p className="mt-3 text-sm"><span className="text-muted">Note :</span> {p.note}</p>}
        <div className="mt-8 flex flex-wrap items-end justify-between gap-4 text-xs text-muted">
          <p>Encaissé par : {cashier?.fullName ?? "—"}<br />Émis le {formatDateTime(p.createdAt)}</p>
          <p className="h-16 w-40 border-t border-dashed border-gray-400 pt-1 text-center">Cachet & signature</p>
        </div>
        <DocFooter demo={p.student.isDemo} />
      </article>

      {p.cancelledAt ? (
        <Card className="no-print mt-4">
          <Badge tone="red">{p.correctedBy ? "Corrigé" : "Annulé"} le {formatDateTime(p.cancelledAt)}</Badge>
          <p className="mt-2 text-sm">Motif : {p.cancelReason}</p>
          {p.correctedBy && <p className="mt-1 text-sm">Nouveau reçu : <Link className="text-brand" href={`/payments/${p.correctedBy.id}`}>{p.correctedBy.receiptNo}</Link></p>}
        </Card>
      ) : can(user.role, "payments.cancel") && (
        <div className="no-print mt-4 grid gap-4 md:grid-cols-2">
          <Card title="Corriger ce paiement">
            <p className="mb-3 text-xs text-muted">Erreur de montant, de date ou de moyen : ce reçu sera marqué « corrigé » (jamais supprimé) et un nouveau reçu lié sera émis.</p>
            <Form action={correctPayment.bind(null, p.id)} className="grid gap-3 xs:grid-cols-2">
              <Input label="Montant (DT) *" name="amount" defaultValue={moneyInput(p.amount)} inputMode="decimal" />
              <Input label="Date *" name="paidAt" type="date" defaultValue={dayInput(p.paidAt)} />
              <Select label="Moyen *" name="modeId" defaultValue={p.modeId} options={modeOptions(modes)} />
              <Input label="Référence" name="reference" defaultValue={p.reference ?? ""} />
              <Input label="Motif de la correction *" name="reason" wrapperClass="xs:col-span-2" />
              <input type="hidden" name="note" value={p.note ?? ""} />
              <div className="xs:col-span-2"><Submit variant="secondary" className="max-sm:w-full">Émettre le reçu corrigé</Submit></div>
            </Form>
          </Card>
          <Card title="Annuler ce paiement">
            <p className="mb-3 text-sm text-muted">L&apos;annulation est tracée ; le reçu reste consultable avec la mention « ANNULÉ » et les échéances redeviennent dues.</p>
            <ConfirmAction action={cancelPayment.bind(null, p.id)} label="Annuler le reçu" title={`Annuler le reçu ${p.receiptNo} ?`} withReason="Motif de l'annulation"
              message={<>Montant : <strong>{formatMoney(p.amount)}</strong>. Cette opération est irréversible.</>} confirmLabel="Annuler le reçu" />
          </Card>
        </div>
      )}
    </div>
  );
}
