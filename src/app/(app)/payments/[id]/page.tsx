import Link from "next/link";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Card, Forbidden, Badge } from "@/components/ui";
import { ConfirmAction } from "@/components/confirm";
import { PrintButton } from "@/components/print-button";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { can } from "@/lib/permissions";
import { formatDate, formatDateTime, formatMoney, formatPeriod } from "@/lib/format";
import { METHOD_LABEL } from "@/lib/labels";
import { cancelPayment } from "../actions";

export default async function Receipt({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ print?: string }> }) {
  const user = await pageUser("payments.read");
  if (!user) return <Forbidden />;
  const { id } = await params;
  const { print } = await searchParams;
  const [p, center] = await Promise.all([
    db.payment.findUnique({
      where: { id },
      include: {
        student: { include: { level: true } },
        schoolYear: true,
        allocations: { include: { invoice: { include: { enrollment: { include: { group: true } } } } } },
      },
    }),
    db.centerSettings.findUnique({ where: { id: 1 } }),
  ]);
  if (!p) notFound();
  const cashier = p.createdById ? await db.user.findUnique({ where: { id: p.createdById }, select: { fullName: true } }) : null;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href="/payments" className="text-sm text-muted hover:text-brand">← Paiements</Link>
        <PrintButton auto={print === "1" && !p.cancelledAt} />
      </div>

      <article className="relative rounded-lg border border-line bg-white p-8 print:border-0 print:p-0">
        {p.cancelledAt && <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-6xl font-black text-red-600/20 -rotate-12">ANNULÉ</div>}
        <header className="flex items-start justify-between gap-4 border-b-2 border-brand pb-4">
          <div>
            <Image src="/brand/logo.png" alt="VAMOS ACADEMY" width={140} height={74} />
            <p className="mt-2 text-xs text-muted">{center?.addressFr}<br /><span dir="rtl">{center?.addressAr}</span><br />Tél. {center?.phone}</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-bold text-navy">REÇU DE PAIEMENT</p>
            <p className="font-mono text-sm">{p.receiptNo}</p>
            <p className="text-sm text-muted">{formatDate(p.paidAt)}</p>
            <p className="text-xs text-muted">Année {p.schoolYear.label}</p>
          </div>
        </header>
        <section className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <p><span className="text-muted">Élève :</span> <strong>{p.student.lastName} {p.student.firstName}</strong></p>
          <p><span className="text-muted">Matricule :</span> {p.student.code}</p>
          <p><span className="text-muted">Niveau :</span> {p.student.level?.name ?? "—"}</p>
          <p><span className="text-muted">Mode :</span> {METHOD_LABEL[p.method]}{p.reference && ` — ${p.reference}`}</p>
        </section>
        <table className="mt-5 w-full text-sm">
          <thead><tr className="border-b border-line text-left text-xs uppercase text-muted"><th className="py-1.5">Désignation</th><th className="py-1.5 text-right">Montant</th></tr></thead>
          <tbody>
            {p.allocations.map((a) => (
              <tr key={a.id} className="border-b border-line/60">
                <td className="py-1.5 capitalize">{formatPeriod(a.invoice.period)} — {a.invoice.enrollment.group.name}</td>
                <td className="py-1.5 text-right tabular-nums">{formatMoney(a.amount)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr><td className="pt-3 text-right font-semibold">Total payé</td><td className="pt-3 text-right text-lg font-bold text-brand tabular-nums">{formatMoney(p.amount)}</td></tr></tfoot>
        </table>
        {p.note && <p className="mt-3 text-sm"><span className="text-muted">Note :</span> {p.note}</p>}
        <footer className="mt-8 flex items-end justify-between text-xs text-muted">
          <p>Encaissé par : {cashier?.fullName ?? "—"}<br />Émis le {formatDateTime(p.createdAt)}</p>
          <p className="h-16 w-40 border-t border-dashed border-gray-400 pt-1 text-center">Cachet & signature</p>
        </footer>
        <p className="mt-6 text-center text-xs text-muted">{center?.receiptFooter}</p>
      </article>

      {p.cancelledAt ? (
        <Card className="no-print mt-4"><Badge tone="red">Annulé le {formatDateTime(p.cancelledAt)}</Badge> <span className="text-sm">Motif : {p.cancelReason}</span></Card>
      ) : can(user.role, "payments.cancel") && (
        <Card title="Annuler ce paiement" className="no-print mt-4">
          <p className="mb-3 text-sm text-muted">L&apos;annulation est tracée dans le journal d&apos;audit ; le reçu reste consultable avec la mention « ANNULÉ » et les échéances redeviennent dues.</p>
          <ConfirmAction action={cancelPayment.bind(null, p.id)} label="Annuler le reçu" title={`Annuler le reçu ${p.receiptNo} ?`} withReason="Motif de l'annulation"
            message={<>Montant : <strong>{formatMoney(p.amount)}</strong>. Cette opération est irréversible.</>} confirmLabel="Annuler le reçu" />
        </Card>
      )}
    </div>
  );
}
