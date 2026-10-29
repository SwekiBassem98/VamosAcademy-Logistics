import { Card, PageHeader, Table, Td, Forbidden, Stat, LinkButton, ApplyButton } from "@/components/ui";
import { BarChart } from "@/components/charts";
import { PrintButton } from "@/components/print-button";
import { DocHeader, DocFooter } from "@/components/document";
import { PersistFilters } from "@/components/persist-filters";
import { FilterField, href, type Params } from "@/components/table-tools";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { financialReport, reportFilters } from "@/server/services/reports";
import { formatMoney, todayISO } from "@/lib/format";
import { levelOptions } from "../students/student-fields";

export const metadata = { title: "Rapports financiers" };

export default async function Reports({ searchParams }: { searchParams: Promise<Params> }) {
  if (!(await pageUser("reports.read"))) return <Forbidden />;
  const params = await searchParams;
  const f = await reportFilters(params);
  const [r, years, levels, groups] = await Promise.all([
    financialReport(f),
    db.schoolYear.findMany({ orderBy: { label: "desc" } }),
    levelOptions(db),
    db.group.findMany({ where: f.yearId ? { schoolYearId: f.yearId } : {}, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const qs = href("", { year: params.year, month: params.month, from: params.from, to: params.to, group: params.group, level: params.level });
  const t = r.total;

  return (
    <>
      <PersistFilters storageKey="reports" />
      <div className="no-print">
        <PageHeader title="Rapports financiers" subtitle={`${f.label}${f.groupName ? ` · ${f.groupName}` : ""}${f.levelName ? ` · ${f.levelName}` : ""}`}
          actions={<>
            <PrintButton label="Imprimer" />
            <LinkButton variant="secondary" prefetch={false} href={`/api/export/report${qs}`}>Exporter CSV</LinkButton>
            <LinkButton variant="secondary" prefetch={false} href={`/api/export/report${qs}${qs ? "&" : "?"}format=xlsx`}>Excel</LinkButton>
          </>} />
        <form className="mb-6 grid grid-cols-2 items-end gap-3 rounded-lg border border-line bg-white p-3 sm:p-4 md:flex md:flex-wrap" role="search" aria-label="Période et périmètre du rapport">
          <FilterField label="Année scolaire">
            <select name="year" defaultValue={params.year ?? ""} className="input md:w-36"><option value="">Active</option>{years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}</select>
          </FilterField>
          <FilterField label="Mois (rapport mensuel)">
            <input type="month" name="month" defaultValue={params.month ?? ""} className="input md:w-44" />
          </FilterField>
          <FilterField label="Ou du"><input type="date" name="from" defaultValue={params.from ?? ""} className="input md:w-40" /></FilterField>
          <FilterField label="Au"><input type="date" name="to" defaultValue={params.to ?? ""} max={todayISO()} className="input md:w-40" /></FilterField>
          <FilterField label="Niveau">
            <select name="level" defaultValue={params.level ?? ""} className="input md:w-48"><option value="">Tous</option>{levels.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select>
          </FilterField>
          <FilterField label="Groupe">
            <select name="group" defaultValue={params.group ?? ""} className="input md:w-44"><option value="">Tous</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          </FilterField>
          <ApplyButton className="col-span-2 md:col-span-1">Afficher</ApplyButton>
        </form>
      </div>

      <div className="hidden print:block"><DocHeader title="Rapport financier" lines={[f.label, ...(f.groupName ? [f.groupName] : []), ...(f.levelName ? [f.levelName] : [])]} /></div>

      <div className="my-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="col-span-2 lg:col-span-1"><Stat label="Facturé" value={formatMoney(t.billed)} hint="échéances de la période" /></div>
        <Stat label="Encaissé" tone="green" value={formatMoney(t.cashed)} hint={r.collectionRate != null ? `taux de recouvrement ${r.collectionRate} %` : undefined} />
        <Stat label="Dépenses" value={r.scoped ? "—" : formatMoney(t.spent)} hint={r.scoped ? "non ventilées par groupe" : undefined} />
        <Stat label="Rémunérations" value={r.scoped ? "—" : formatMoney(t.payroll)} />
        <Stat label={r.scoped ? "Impayés échus" : "Résultat"} tone={r.scoped || t.result < 0 ? "brand" : "green"} value={formatMoney(r.scoped ? t.overdue : t.result)} hint={r.scoped ? undefined : `impayés échus : ${formatMoney(t.overdue)}`} />
      </div>

      <Card title="Évolution mensuelle" className="mb-6 print:hidden">
        <BarChart data={r.months.map((m) => ({ label: m.label.slice(0, 4) + ". " + m.label.slice(-2), values: [m.cashed, m.spent + m.payroll] }))} series={[{ name: "Encaissé" }, { name: "Dépenses + rémunérations" }]} unit="money" caption="Encaissements et charges par mois, en milliers de dinars" />
      </Card>

      <Table head={["Mois", "Facturé", "Encaissé", "Dépenses", "Rémunérations", "Résultat", "Impayés échus"]} caption="Détail mensuel">
        {r.months.map((m) => (
          <tr key={m.key}>
            <Td cell="primary" className="font-semibold capitalize">{m.label}</Td>
            <Td cell="num">{formatMoney(m.billed)}</Td>
            <Td cell="num" className="text-success-600">{formatMoney(m.cashed)}</Td>
            <Td cell="num">{formatMoney(m.spent)}</Td>
            <Td cell="num">{formatMoney(m.payroll)}</Td>
            <Td cell="num" className={`font-semibold ${m.result < 0 ? "text-brand" : "text-navy"}`}>{formatMoney(m.result)}</Td>
            <Td cell="num">{formatMoney(m.overdue)}</Td>
          </tr>
        ))}
        <tr data-row="total" className="bg-surface font-semibold">
          <Td cell="primary">Total</Td><Td cell="num">{formatMoney(t.billed)}</Td><Td cell="num">{formatMoney(t.cashed)}</Td><Td cell="num">{formatMoney(t.spent)}</Td>
          <Td cell="num">{formatMoney(t.payroll)}</Td><Td cell="num">{formatMoney(t.result)}</Td><Td cell="num">{formatMoney(t.overdue)}</Td>
        </tr>
      </Table>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card title="Par groupe">
          {r.byGroup.length === 0 ? <p className="text-sm text-muted">Aucune donnée.</p> : (
            <table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted"><th>Groupe</th><th className="text-right">Encaissé</th><th className="text-right">Impayé</th></tr></thead>
              <tbody>{r.byGroup.map((g) => <tr key={g.name} className="border-t border-line"><td className="py-1.5 pr-2">{g.name}</td><td className="text-right tabular-nums">{formatMoney(g.cashed)}</td><td className="text-right tabular-nums">{formatMoney(g.overdue)}</td></tr>)}</tbody>
            </table>
          )}
        </Card>
        <Card title="Par moyen de paiement">
          {r.byMode.length === 0 ? <p className="text-sm text-muted">Aucun encaissement.</p> : (
            <ul className="space-y-1 text-sm">{r.byMode.map(([k, v]) => <li key={k} className="flex justify-between"><span>{k}</span><span className="tabular-nums">{formatMoney(v)}</span></li>)}</ul>
          )}
        </Card>
        <Card title="Dépenses par catégorie">
          {r.scoped ? <p className="text-sm text-muted">Non disponible avec un filtre niveau / groupe.</p> : r.byCategory.length === 0 ? <p className="text-sm text-muted">Aucune dépense.</p> : (
            <ul className="space-y-1 text-sm">{r.byCategory.map(([k, v]) => <li key={k} className="flex justify-between"><span>{k}</span><span className="tabular-nums">{formatMoney(v)}</span></li>)}</ul>
          )}
        </Card>
      </div>
      <p className="mt-4 text-xs text-muted">Encaissé = paiements non annulés datés de la période (affectés aux échéances du filtre). Facturé et impayés = échéances actives dont la date tombe dans la période. Montants calculés en millimes, sans arrondi.</p>
      <div className="hidden print:block"><DocFooter /></div>
    </>
  );
}
