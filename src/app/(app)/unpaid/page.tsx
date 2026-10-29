import Link from "next/link";
import { PageHeader, Table, Td, Badge, Forbidden, LinkButton, Stat, EmptyState } from "@/components/ui";
import { Bulk, SelectAll, SelectRow } from "@/components/bulk";
import { PrintButton } from "@/components/print-button";
import { DocHeader, DocFooter } from "@/components/document";
import { PersistFilters } from "@/components/persist-filters";
import { FilterBar, href, type Params } from "@/components/table-tools";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { unpaidSummary } from "@/server/services/finance";
import { can } from "@/lib/permissions";
import { formatDate, formatMoney } from "@/lib/format";
import { levelOptions } from "../students/student-fields";

export const metadata = { title: "Impayés" };

export default async function Unpaid({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await pageUser("payments.read");
  if (!user) return <Forbidden />;
  const params = await searchParams;
  const year = await db.schoolYear.findFirst({ where: { active: true } });
  const minDays = Number(params.minDays) || undefined;
  const [rows, levels, groups, reminder] = await Promise.all([
    year ? unpaidSummary(year.id, new Date(), { groupId: params.group, levelId: params.level, minDays }) : [],
    levelOptions(db),
    db.group.findMany({ where: { schoolYearId: year?.id ?? "" }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.messageTemplate.findUnique({ where: { code: "RAPPEL_PAIEMENT" } }),
  ]);
  const total = rows.reduce((s, r) => s + r.due, 0);
  const qs = href("", { group: params.group, level: params.level, minDays: params.minDays });
  const canMsg = can(user.role, "messages.write") && reminder;

  return (
    <>
      <PersistFilters storageKey="unpaid" />
      <div className="no-print">
        <PageHeader title="Impayés" subtitle={`Échéances échues non réglées — année ${year?.label ?? "—"}`}
          actions={<>
            <PrintButton label="Imprimer l'état" />
            <LinkButton variant="secondary" prefetch={false} href={`/api/export/unpaid${qs}`}>CSV</LinkButton>
            <LinkButton variant="secondary" prefetch={false} href={`/api/export/unpaid${qs}${qs ? "&" : "?"}format=xlsx`}>Excel</LinkButton>
          </>} />
        <FilterBar params={params} keep={[]}>
          <select name="level" defaultValue={params.level ?? ""} className="input w-full sm:w-52" aria-label="Niveau"><option value="">Tous niveaux</option>{levels.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select>
          <select name="group" defaultValue={params.group ?? ""} className="input w-full sm:w-48" aria-label="Groupe"><option value="">Tous groupes</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
          <select name="minDays" defaultValue={params.minDays ?? ""} className="input w-full sm:w-48" aria-label="Ancienneté"><option value="">Tout retard</option><option value="15">Plus de 15 jours</option><option value="30">Plus de 30 jours</option><option value="60">Plus de 60 jours</option></select>
        </FilterBar>
      </div>
      <div className="hidden print:block"><DocHeader title="État des impayés" lines={[`Année ${year?.label ?? "—"}`, `Au ${formatDate(new Date())}`]} /></div>
      <div className="my-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Total impayé" tone="brand" value={formatMoney(total)} />
        <Stat label="Élèves concernés" value={rows.length} />
        <Stat label="Échéances en retard" value={rows.reduce((s, r) => s + r.count, 0)} />
      </div>
      {rows.length === 0 ? <EmptyState title="Aucun impayé échu" text="Tous les élèves sont à jour pour ces critères." /> : (
        <Bulk noun="élève(s)" links={[
          ...(canMsg ? [{ label: "Préparer des rappels", href: `/messages/new?template=${reminder!.id}` }] : []),
          { label: "Exporter la sélection", href: "/api/export/students" },
        ]}>
          <Table head={[<SelectAll key="a" />, "Élève", "Groupes", "Parent / téléphone", "Échéances", "Plus ancienne", "Montant dû", ""]}>
            {rows.map(({ student: s, due, count, oldest, groups: gs }) => {
              const g = s.guardians[0]?.guardian;
              return (
                <tr key={s.id}>
                  <Td className="no-print"><SelectRow id={s.id} label={`${s.lastName} ${s.firstName}`} /></Td>
                  <Td><Link href={`/students/${s.id}`} className="font-medium text-navy hover:text-brand">{s.lastName} {s.firstName}</Link><span className="block text-xs text-muted">{s.code} · {s.level?.name ?? "—"}</span></Td>
                  <Td className="whitespace-normal text-xs">{[...gs].join(", ")}</Td>
                  <Td>{g ? <>{g.lastName} {g.firstName}<span className="block text-xs">{g.phone}</span></> : <span className="text-muted">aucun parent</span>}</Td>
                  <Td><Badge tone="red">{count}</Badge></Td>
                  <Td>{formatDate(oldest)}</Td>
                  <Td className="font-semibold tabular-nums">{formatMoney(due)}</Td>
                  <Td className="no-print space-x-3 text-xs">
                    {can(user.role, "payments.write") && <Link href={`/payments/new?student=${s.id}`} className="text-brand">Encaisser</Link>}
                    <Link href={`/students/${s.id}/releve`} className="text-navy">Relevé</Link>
                  </Td>
                </tr>
              );
            })}
            <tr className="bg-gray-50 font-semibold"><Td className="no-print" /><Td>Total</Td><Td /><Td /><Td>{rows.reduce((s, r) => s + r.count, 0)}</Td><Td /><Td className="tabular-nums">{formatMoney(total)}</Td><Td className="no-print" /></tr>
          </Table>
        </Bulk>
      )}
      <p className="no-print mt-3 text-xs text-muted">Les rappels sont préparés (texte en français, téléphone du parent) puis envoyés par l&apos;équipe : aucun SMS ni message n&apos;est envoyé automatiquement. Historique dans « Messages & rappels ».</p>
      <div className="hidden print:block"><DocFooter /></div>
    </>
  );
}
