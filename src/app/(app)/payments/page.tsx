import Link from "next/link";
import { PageHeader, Table, Td, Badge, LinkButton, Forbidden, Stat } from "@/components/ui";
import { FilterBar, Pagination, SortLink, listParams, href, type Params } from "@/components/table-tools";
import { PersistFilters } from "@/components/persist-filters";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { paymentModes } from "@/server/modes";
import { can } from "@/lib/permissions";
import { formatDate, formatMoney, parseDay } from "@/lib/format";
import { paymentWhere } from "@/server/filters";
import { levelOptions } from "../students/student-fields";

export const metadata = { title: "Paiements" };
const PER = 30;
export default async function Payments({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await pageUser("payments.read");
  if (!user) return <Forbidden />;
  const params = await searchParams;
  const { where, from, to } = paymentWhere(params);
  const { sort, dir, page } = listParams(params, ["paidAt", "amount", "receiptNo"] as const, "paidAt", "desc");
  const [total, payments, sums, modes, years, levels, groups] = await Promise.all([
    db.payment.count({ where }),
    db.payment.findMany({ where, include: { student: true, mode: true, correctedBy: { select: { receiptNo: true } } }, orderBy: [{ [sort]: dir }, { receiptNo: "desc" }], skip: (page - 1) * PER, take: PER }),
    db.payment.groupBy({ by: ["modeId"], where: { ...where, cancelledAt: null }, _sum: { amount: true }, _count: { _all: true } }),
    paymentModes(true),
    db.schoolYear.findMany({ orderBy: { label: "desc" } }),
    levelOptions(db),
    db.group.findMany({ where: { schoolYear: { active: true } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const totalValid = sums.reduce((s, m) => s + (m._sum.amount ?? 0), 0);
  const count = sums.reduce((s, m) => s + m._count._all, 0);
  const base = "/payments";
  const exportQs = href("", { ...params, from, to, page: undefined, sort: undefined, dir: undefined });

  return (
    <>
      <PersistFilters storageKey="payments" />
      <PageHeader title="Paiements" subtitle={`Du ${formatDate(parseDay(from))} au ${formatDate(parseDay(to))}`}
        actions={<>
          <LinkButton variant="secondary" prefetch={false} href={`/api/export/payments${exportQs}`}>CSV</LinkButton>
          <LinkButton variant="secondary" prefetch={false} href={`/api/export/payments${exportQs}${exportQs ? "&" : "?"}format=xlsx`}>Excel</LinkButton>
          {can(user.role, "payments.write") && <LinkButton href="/payments/new">Encaisser</LinkButton>}
        </>} />
      <FilterBar params={params}>
        <label className="text-sm">Du <input type="date" name="from" defaultValue={from} className="input w-40" /></label>
        <label className="text-sm">Au <input type="date" name="to" defaultValue={to} className="input w-40" /></label>
        <input name="q" defaultValue={params.q ?? ""} placeholder="Élève, n° de reçu, référence…" className="input w-full sm:w-52" aria-label="Rechercher" />
        <select name="mode" defaultValue={params.mode ?? ""} className="input w-full sm:w-40" aria-label="Moyen de paiement"><option value="">Tous moyens</option>{modes.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}</select>
        <select name="year" defaultValue={params.year ?? ""} className="input w-full sm:w-36" aria-label="Année scolaire"><option value="">Toutes années</option>{years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}</select>
        <select name="level" defaultValue={params.level ?? ""} className="input w-full sm:w-48" aria-label="Niveau"><option value="">Tous niveaux</option>{levels.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select>
        <select name="group" defaultValue={params.group ?? ""} className="input w-full sm:w-44" aria-label="Groupe"><option value="">Tous groupes</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
        <select name="state" defaultValue={params.state ?? ""} className="input w-full sm:w-32" aria-label="État"><option value="">Tous</option><option value="valid">Valides</option><option value="cancelled">Annulés</option></select>
      </FilterBar>
      <div className="mb-4 grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Total encaissé" tone="green" value={formatMoney(totalValid)} hint={`${count} reçu(s) valide(s)`} />
        {modes.filter((m) => sums.some((x) => x.modeId === m.id)).slice(0, 4).map((m) => <Stat key={m.id} label={m.label} value={formatMoney(sums.find((x) => x.modeId === m.id)?._sum.amount ?? 0)} />)}
      </div>
      <Table head={[<SortLink key="r" base={base} params={params} field="receiptNo" label="Reçu" />, <SortLink key="d" base={base} params={params} field="paidAt" label="Date" />, "Élève", "Moyen", <SortLink key="a" base={base} params={params} field="amount" label="Montant" />, "État"]} empty={payments.length === 0}>
        {payments.map((p) => (
          <tr key={p.id} className={p.cancelledAt ? "text-muted" : "hover:bg-gray-50"}>
            <Td className="font-mono text-xs"><Link href={`/payments/${p.id}`} className="hover:text-brand">{p.receiptNo}</Link></Td>
            <Td>{formatDate(p.paidAt)}</Td>
            <Td><Link href={`/students/${p.studentId}`} className="hover:text-brand">{p.student.lastName} {p.student.firstName}</Link></Td>
            <Td>{p.mode.label}{p.reference && <span className="block text-xs text-muted">{p.reference}</span>}</Td>
            <Td className={p.cancelledAt ? "tabular-nums line-through" : "font-semibold tabular-nums"}>{formatMoney(p.amount)}</Td>
            <Td>{p.correctedBy ? <Badge tone="amber">corrigé → {p.correctedBy.receiptNo}</Badge> : p.cancelledAt ? <Badge tone="red">annulé</Badge> : p.correctsId ? <Badge tone="blue">correction</Badge> : <Badge tone="green">valide</Badge>}</Td>
          </tr>
        ))}
      </Table>
      <Pagination base={base} params={params} page={page} total={total} perPage={PER} />
    </>
  );
}
