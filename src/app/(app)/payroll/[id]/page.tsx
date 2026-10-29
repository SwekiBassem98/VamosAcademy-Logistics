import Link from "next/link";
import { notFound } from "next/navigation";
import { Forbidden, Badge } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { DocHeader, DocFooter, DocPage } from "@/components/document";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { PAY_MODE_LABEL, PAY_STATUS_LABEL } from "@/lib/payroll";

export const metadata = { title: "Fiche de rémunération" };

type Details = { sessions?: { date: string; group: string; minutes: number; scheduled: boolean }[]; minutes?: number; collected?: number };

export default async function PaySlip({ params }: { params: Promise<{ id: string }> }) {
  if (!(await pageUser("expenses.read"))) return <Forbidden />;
  const { id } = await params;
  const p = await db.teacherPay.findUnique({ where: { id }, include: { teacher: true, mode: true, expense: true } });
  if (!p) notFound();
  const d = (p.details ?? {}) as Details;
  return (
    <>
      <div className="no-print mx-auto mb-4 flex max-w-3xl justify-between">
        <Link href={`/payroll?period=${p.period}`} className="text-sm text-muted hover:text-brand">← Rémunérations</Link>
        <PrintButton />
      </div>
      <DocPage>
        <DocHeader title="Fiche de rémunération" reference={p.period} lines={[`${p.teacher.lastName} ${p.teacher.firstName}`, PAY_STATUS_LABEL[p.status]]} />
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1.5">
          <div className="flex gap-2"><dt className="w-36 text-muted">Modalité</dt><dd>{PAY_MODE_LABEL[p.payMode]}</dd></div>
          <div className="flex gap-2"><dt className="w-36 text-muted">Taux</dt><dd>{p.payMode === "POURCENTAGE" ? `${p.rate} %` : formatMoney(p.rate)}{p.payMode === "HORAIRE" ? " / heure" : p.payMode === "PAR_SEANCE" ? " / séance" : ""}</dd></div>
          <div className="flex gap-2"><dt className="w-36 text-muted">Séances tenues</dt><dd>{d.sessions?.length ?? 0} ({((d.minutes ?? 0) / 60).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} h)</dd></div>
          <div className="flex gap-2"><dt className="w-36 text-muted">Encaissé sur ses groupes</dt><dd>{formatMoney(d.collected ?? 0)}</dd></div>
        </dl>
        <table className="mt-5 w-full">
          <tbody>
            <tr className="border-b border-line"><td className="py-1.5">Montant calculé</td><td className="text-right tabular-nums">{formatMoney(p.computedAmount)}</td></tr>
            {p.adjustment !== 0 && <tr className="border-b border-line"><td className="py-1.5">Ajustement — {p.adjustmentNote}</td><td className="text-right tabular-nums">{p.adjustment > 0 ? "+" : ""}{formatMoney(p.adjustment)}</td></tr>}
            <tr><td className="pt-2 font-semibold">Net à payer</td><td className="pt-2 text-right text-lg font-bold text-brand tabular-nums">{formatMoney(p.amount)}</td></tr>
          </tbody>
        </table>
        {p.status === "PAYE" && <p className="mt-2 text-sm">Payé le {p.paidAt ? formatDate(p.paidAt) : "—"} par {p.mode?.label}{p.expense?.reference && ` (${p.expense.reference})`}.</p>}
        {p.status === "ANNULE" && <p className="mt-2"><Badge tone="red">Annulée le {formatDateTime(p.cancelledAt)}</Badge> {p.cancelReason}</p>}
        {d.sessions && d.sessions.length > 0 && (
          <>
            <h2 className="mt-6 mb-1 bg-navy px-2 py-1 text-xs font-bold uppercase text-white">Détail des séances (appels enregistrés)</h2>
            <table className="w-full text-xs">
              <thead><tr className="text-left text-muted"><th className="py-1">Date</th><th>Groupe</th><th className="text-right">Durée</th></tr></thead>
              <tbody>{d.sessions.map((s, i) => <tr key={i} className="border-t border-line/60"><td className="py-1">{formatDate(new Date(`${s.date}T12:00:00Z`))}</td><td>{s.group}{!s.scheduled && " (rattrapage, 1 h 30 par défaut)"}</td><td className="text-right">{s.minutes} min</td></tr>)}</tbody>
            </table>
          </>
        )}
        <div className="mt-10 grid grid-cols-2 gap-10 text-center text-xs">
          <p className="h-16 border-t border-dashed border-gray-400 pt-1">Signature de l&apos;enseignant</p>
          <p className="h-16 border-t border-dashed border-gray-400 pt-1">Cachet de VAMOS ACADEMY</p>
        </div>
        <DocFooter demo={p.teacher.isDemo} />
      </DocPage>
    </>
  );
}
