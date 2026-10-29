import Link from "next/link";
import { Card, PageHeader, Table, Td, Badge, Forbidden, Stat, LinkButton, EmptyState } from "@/components/ui";
import { Form, Input, Select, Submit } from "@/components/form";
import { ConfirmAction } from "@/components/confirm";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { paymentModes, modeOptions } from "@/server/modes";
import { can } from "@/lib/permissions";
import { formatMoney, todayISO } from "@/lib/format";
import { PAY_MODE_LABEL, PAY_STATUS_LABEL } from "@/lib/payroll";
import { computeAll, computeOne, validate, pay, cancelPayroll } from "./actions";

export const metadata = { title: "Rémunérations" };
const TONE = { BROUILLON: "gray", VALIDE: "blue", PAYE: "green", ANNULE: "red" } as const;

function quantityLabel(mode: keyof typeof PAY_MODE_LABEL, q: number) {
  if (mode === "HORAIRE") return `${(q / 60).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} h`;
  if (mode === "PAR_SEANCE") return `${q} séance(s)`;
  if (mode === "POURCENTAGE") return `assiette ${formatMoney(q)}`;
  return "forfait";
}

export default async function Payroll({ searchParams }: { searchParams: Promise<{ period?: string }> }) {
  const user = await pageUser("expenses.read");
  if (!user) return <Forbidden />;
  const manage = can(user.role, "payroll.manage");
  const sp = await searchParams;
  const current = todayISO().slice(0, 7);
  const period = /^\d{4}-\d{2}$/.test(sp.period ?? "") && sp.period! <= current ? sp.period! : current;
  const [teachers, pays, modes] = await Promise.all([
    db.teacher.findMany({ where: { active: true }, orderBy: { lastName: "asc" } }),
    db.teacherPay.findMany({ where: { period }, include: { teacher: true, mode: true }, orderBy: [{ createdAt: "desc" }] }),
    manage ? paymentModes() : [],
  ]);
  const live = pays.filter((p) => p.status !== "ANNULE");
  const cancelled = pays.filter((p) => p.status === "ANNULE");
  const missing = teachers.filter((t) => !live.some((p) => p.teacherId === t.id));
  const total = live.reduce((s, p) => s + p.amount, 0);
  const paid = live.filter((p) => p.status === "PAYE").reduce((s, p) => s + p.amount, 0);

  return (
    <>
      <PageHeader title="Rémunérations des enseignants" subtitle="Calcul selon la modalité de chaque enseignant : à l'heure (séances pointées × durée du créneau), par séance, forfait mensuel ou pourcentage des mensualités encaissées sur ses groupes."
        actions={<>
          <LinkButton variant="secondary" prefetch={false} href={`/api/export/payroll?period=${period}`}>CSV</LinkButton>
          <LinkButton variant="secondary" prefetch={false} href={`/api/export/payroll?period=${period}&format=xlsx`}>Excel</LinkButton>
        </>} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <form className="flex items-end gap-2"><label className="text-sm">Mois <input type="month" name="period" defaultValue={period} max={current} className="input w-44" /></label><button className="rounded-md bg-navy px-4 py-2 text-sm text-white">Afficher</button></form>
        {manage && <Form action={computeAll.bind(null, period)}><Submit>Calculer les paies de {period}</Submit></Form>}
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <Stat label="Total du mois" value={formatMoney(total)} hint={`${live.length} paie(s)`} />
        <Stat label="Déjà payé" tone="green" value={formatMoney(paid)} />
        <Stat label="Reste à payer" tone="brand" value={formatMoney(total - paid)} hint={missing.length ? `${missing.length} enseignant(s) non calculé(s)` : undefined} />
      </div>
      {live.length === 0 ? <EmptyState title="Aucune paie calculée pour ce mois" text={manage ? "Cliquez sur « Calculer les paies » : les montants sont calculés depuis les appels enregistrés et les paiements encaissés." : undefined} /> : (
        <Table head={["Enseignant", "Modalité", "Base", "Calculé", "Ajustement", "Montant", "Statut", "Actions"]}>
          {live.map((p) => (
            <tr key={p.id} className="align-top">
              <Td><Link href={`/payroll/${p.id}`} className="font-medium text-navy hover:text-brand">{p.teacher.lastName} {p.teacher.firstName}</Link></Td>
              <Td className="text-xs">{PAY_MODE_LABEL[p.payMode]}<span className="block text-muted">{p.payMode === "POURCENTAGE" ? `${p.rate} %` : formatMoney(p.rate)}</span></Td>
              <Td className="text-xs">{quantityLabel(p.payMode, p.quantity)}</Td>
              <Td className="tabular-nums">{formatMoney(p.computedAmount)}</Td>
              <Td className="tabular-nums text-xs">{p.adjustment ? <>{p.adjustment > 0 ? "+" : ""}{formatMoney(p.adjustment)}<span className="block text-muted">{p.adjustmentNote}</span></> : "—"}</Td>
              <Td className="font-semibold tabular-nums">{formatMoney(p.amount)}</Td>
              <Td><Badge tone={TONE[p.status]}>{PAY_STATUS_LABEL[p.status]}</Badge>{p.mode && <span className="block text-xs text-muted">{p.mode.label}</span>}</Td>
              <Td className="min-w-64 whitespace-normal">
                {manage && p.status === "BROUILLON" && (
                  <div className="space-y-2">
                    <Form action={computeOne.bind(null, p.teacherId, period)}><Submit variant="ghost" className="px-0 py-0 text-xs">↻ Recalculer</Submit></Form>
                    <Form action={validate.bind(null, p.id)} className="flex flex-wrap items-end gap-1">
                      <input name="adjustment" placeholder="± ajust." className="input w-24 py-1 text-xs" aria-label="Ajustement en DT" />
                      <input name="note" placeholder="Motif" className="input w-32 py-1 text-xs" aria-label="Motif de l'ajustement" />
                      <Submit variant="secondary" className="px-2 py-1 text-xs">Valider</Submit>
                    </Form>
                  </div>
                )}
                {manage && p.status === "VALIDE" && (
                  <Form action={pay.bind(null, p.id)} className="flex flex-wrap items-end gap-1">
                    <Select label="Moyen" name="modeId" options={modeOptions(modes)} wrapperClass="w-36" />
                    <Input label="Date" name="paidAt" type="date" defaultValue={todayISO()} max={todayISO()} wrapperClass="w-36" />
                    <Input label="Réf." name="reference" wrapperClass="w-24" />
                    <Submit className="px-2 py-1.5 text-xs">Payer</Submit>
                  </Form>
                )}
                {manage && (
                  <div className="mt-1"><ConfirmAction action={cancelPayroll.bind(null, p.id)} small variant="secondary" label="Annuler" title={`Annuler la paie de ${p.teacher.lastName} (${period}) ?`} withReason="Motif"
                    message={p.status === "PAYE" ? "La dépense liée sera aussi annulée (conservée dans l'historique)." : "La paie restera visible comme annulée ; vous pourrez la recalculer."} /></div>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
      {missing.length > 0 && live.length > 0 && <p className="mt-2 text-xs text-muted">Non calculés : {missing.map((t) => `${t.lastName} ${t.firstName}`).join(", ")}.</p>}
      {cancelled.length > 0 && (
        <Card title="Paies annulées (historique)" className="mt-6">
          <ul className="space-y-1 text-sm text-muted">{cancelled.map((p) => <li key={p.id}><Link href={`/payroll/${p.id}`} className="hover:text-brand">{p.teacher.lastName} {p.teacher.firstName}</Link> — {formatMoney(p.amount)} — {p.cancelReason}</li>)}</ul>
        </Card>
      )}
    </>
  );
}
