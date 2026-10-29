import Link from "next/link";
import { notFound } from "next/navigation";
import { buttonClass, Forbidden, LinkButton, Badge } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { DocHeader, DocFooter, DocPage } from "@/components/document";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { studentStatement } from "@/server/services/finance";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata = { title: "Relevé de compte" };

export default async function Statement({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ year?: string }> }) {
  if (!(await pageUser("payments.read"))) return <Forbidden />;
  const { id } = await params;
  const sp = await searchParams;
  const [s, years] = await Promise.all([
    db.student.findUnique({ where: { id }, include: { level: true, guardians: { include: { guardian: true }, orderBy: { isPayer: "desc" }, take: 1 } } }),
    db.schoolYear.findMany({ orderBy: { label: "desc" } }),
  ]);
  if (!s) notFound();
  const year = years.find((y) => y.id === sp.year) ?? years.find((y) => y.active) ?? years[0];
  const lines = year ? await studentStatement(id, year.id) : [];
  const balance = lines.at(-1)?.balance ?? 0;
  const g = s.guardians[0]?.guardian;

  return (
    <>
      <div className="no-print mx-auto mb-4 flex max-w-3xl flex-wrap items-center justify-between gap-2">
        <Link href={`/students/${s.id}`} className="inline-flex min-h-10 items-center text-sm font-medium text-muted hover:text-brand">← Dossier de l&apos;élève</Link>
        <div className="flex flex-wrap gap-2">
          <form className="flex gap-1"><select name="year" defaultValue={year?.id} className="input w-32" aria-label="Année">{years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}</select><button className={buttonClass({ variant: "navy" })}>OK</button></form>
          <LinkButton variant="secondary" prefetch={false} href={`/api/export/statement?student=${s.id}&year=${year?.id ?? ""}&format=xlsx`}>Excel</LinkButton>
          <PrintButton />
        </div>
      </div>
      <DocPage>
        <DocHeader title="Relevé de compte" reference={s.code} lines={[`Année ${year?.label ?? "—"}`, `Au ${formatDate(new Date())}`]} />
        <div className="mt-4 grid gap-2 sm:grid-cols-2 print:grid-cols-2">
          <p><span className="text-muted">Élève :</span> <strong>{s.lastName} {s.firstName}</strong></p>
          <p><span className="text-muted">Niveau :</span> {s.level?.name ?? "—"}</p>
          <p><span className="text-muted">Parent :</span> {g ? `${g.lastName} ${g.firstName} — ${g.phone}` : "—"}</p>
          <p><span className="text-muted">Solde :</span> <strong className={balance > 0 ? "text-brand" : "text-success-700"}>{balance > 0 ? `${formatMoney(balance)} restant dû` : balance < 0 ? `${formatMoney(-balance)} en avance` : "à jour"}</strong></p>
        </div>
        <table className="mt-5 w-full text-sm">
          <thead><tr className="border-b-2 border-navy text-left text-xs uppercase text-muted"><th className="py-1.5">Date</th><th>Opération</th><th className="text-right">Débit</th><th className="text-right">Crédit</th><th className="text-right">Solde</th></tr></thead>
          <tbody>
            {lines.length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted">Aucune opération.</td></tr>}
            {lines.map((l, i) => (
              <tr key={i} className={`border-b border-line/60 align-top ${l.kind === "ANNULATION" ? "text-muted" : ""}`}>
                <td className="py-1.5 whitespace-nowrap">{formatDate(l.date)}</td>
                <td className="py-1.5">{l.kind === "ANNULATION" && <Badge tone="amber">annulation</Badge>} {l.label}{l.ref && <span className="ml-1 font-mono text-xs text-muted">{l.ref}</span>}</td>
                <td className="py-1.5 text-right tabular-nums">{l.debit ? formatMoney(l.debit) : ""}</td>
                <td className="py-1.5 text-right tabular-nums">{l.credit ? formatMoney(l.credit) : ""}</td>
                <td className="py-1.5 text-right font-medium tabular-nums">{formatMoney(l.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted">Débit : échéances facturées (et reçus annulés). Crédit : paiements (et échéances annulées). Les opérations annulées restent listées pour la traçabilité.</p>
        <DocFooter demo={s.isDemo} />
      </DocPage>
    </>
  );
}
