import { Card, PageHeader, Forbidden, Badge, Table, Td } from "@/components/ui";
import { Form, Input, Select, Submit, Checkbox } from "@/components/form";
import { ConfirmAction } from "@/components/confirm";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { formatMoney, moneyInput } from "@/lib/format";
import { SettingsTabs } from "../tabs";
import { saveDiscountType, saveFeeRule, deleteFeeRule, savePaymentMode } from "../actions";

export const metadata = { title: "Tarifs & paiements" };

export default async function FinanceSettings({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  if (!(await pageUser("settings.manage"))) return <Forbidden />;
  const sp = await searchParams;
  const years = await db.schoolYear.findMany({ orderBy: { label: "desc" } });
  const year = years.find((y) => y.id === sp.year) ?? years.find((y) => y.active) ?? years[0];
  const [rules, cycles, levels, subjects, modes, discounts] = await Promise.all([
    year ? db.feeRule.findMany({ where: { schoolYearId: year.id }, include: { cycle: true, level: { include: { cycle: true } }, subject: true } }) : [],
    db.cycle.findMany({ orderBy: { order: "asc" } }),
    db.level.findMany({ include: { cycle: true }, orderBy: [{ cycle: { order: "asc" } }, { order: "asc" }] }),
    db.subject.findMany({ orderBy: { name: "asc" } }),
    db.paymentMode.findMany({ orderBy: [{ order: "asc" }], include: { _count: { select: { payments: true } } } }),
    db.discountType.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { enrollments: true } } } }),
  ]);
  const specificity = (r: (typeof rules)[number]) => (r.levelId ? 4 : 0) + (r.subjectId ? 2 : 0) + (r.cycleId ? 1 : 0);
  const sorted = [...rules].sort((a, b) => specificity(a) - specificity(b));

  return (
    <>
      <PageHeader title="Paramètres du centre" />
      <SettingsTabs active="finance" />

      <Card title={`Grille tarifaire — année ${year?.label ?? "—"}`} actions={
        <form className="flex gap-1"><select name="year" defaultValue={year?.id} className="input w-32 py-1 text-xs" aria-label="Année">{years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}</select><button className="rounded bg-navy px-2 text-xs text-white">OK</button></form>
      }>
        <p className="mb-3 text-xs text-muted">
          Tarif proposé automatiquement à la création d&apos;un groupe quand la mensualité est laissée vide. La règle la plus précise l&apos;emporte :
          niveau + matière › niveau › cycle + matière › matière › cycle › tarif par défaut de l&apos;année. Modifier la grille ne change pas les groupes existants.
        </p>
        <Table head={["Portée", "Mensualité", "Frais d'inscription", ""]} empty={sorted.length === 0}>
          {sorted.map((r) => (
            <tr key={r.id}>
              <Td className="whitespace-normal">
                {[r.level ? `${r.level.cycle.name} — ${r.level.name}` : r.cycle?.name, r.subject?.name].filter(Boolean).join(" · ") || <em className="text-muted">Tarif par défaut de l&apos;année</em>}
              </Td>
              <Td className="font-semibold tabular-nums">{formatMoney(r.monthlyFee)}</Td>
              <Td className="tabular-nums">{formatMoney(r.registrationFee)}</Td>
              <Td><ConfirmAction action={deleteFeeRule.bind(null, r.id)} small variant="secondary" label="Retirer" title="Retirer ce tarif de la grille ?" message="Les groupes déjà créés gardent leur tarif." /></Td>
            </tr>
          ))}
        </Table>
        {year && (
          <Form action={saveFeeRule} className="mt-4 grid items-end gap-3 border-t border-line pt-4 sm:grid-cols-3 lg:grid-cols-6" resetOnSuccess>
            <input type="hidden" name="schoolYearId" value={year.id} />
            <Select label="Cycle" name="cycleId" placeholder="Tous" options={cycles.map((c) => ({ value: c.id, label: c.name }))} />
            <Select label="Niveau" name="levelId" placeholder="Tous" options={levels.map((l) => ({ value: l.id, label: `${l.cycle.name} — ${l.name}` }))} />
            <Select label="Matière" name="subjectId" placeholder="Toutes" options={subjects.map((s) => ({ value: s.id, label: s.name }))} />
            <Input label="Mensualité (DT) *" name="monthlyFee" inputMode="decimal" placeholder="50,000" />
            <Input label="Inscription (DT)" name="registrationFee" inputMode="decimal" placeholder="0,000" />
            <Submit variant="secondary">Ajouter / remplacer</Submit>
          </Form>
        )}
      </Card>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title="Moyens de paiement">
          <p className="mb-3 text-xs text-muted">Utilisés pour les encaissements, dépenses et rémunérations. Un moyen déjà utilisé ne peut pas être supprimé, seulement désactivé.</p>
          <ul className="space-y-2">
            {modes.map((m) => (
              <li key={m.id} className="rounded border border-line p-2">
                <details>
                  <summary className="flex cursor-pointer items-center justify-between text-sm">
                    <span>{m.label} <span className="font-mono text-xs text-muted">{m.code}</span> {m.requiresReference && <Badge tone="blue">réf. requise</Badge>} {!m.active && <Badge>désactivé</Badge>}</span>
                    <span className="text-xs text-muted">{m._count.payments} paiement(s) ✎</span>
                  </summary>
                  <Form action={savePaymentMode.bind(null, m.id)} className="mt-2 grid grid-cols-2 items-end gap-2">
                    <input type="hidden" name="code" value={m.code} />
                    <Input label="Libellé" name="label" defaultValue={m.label} />
                    <div className="space-y-1">
                      <Checkbox label="Référence obligatoire" name="requiresReference" defaultChecked={m.requiresReference} />
                      <Checkbox label="Actif" name="active" defaultChecked={m.active} />
                    </div>
                    <Submit variant="secondary">Enregistrer</Submit>
                  </Form>
                </details>
              </li>
            ))}
          </ul>
          <Form action={savePaymentMode.bind(null, null)} className="mt-4 grid grid-cols-2 items-end gap-2 border-t border-line pt-4" resetOnSuccess>
            <Input label="Code" name="code" placeholder="FLOUCI" />
            <Input label="Libellé" name="label" placeholder="Paiement mobile Flouci" />
            <Checkbox label="Référence obligatoire" name="requiresReference" />
            <Submit variant="secondary">Ajouter</Submit>
          </Form>
        </Card>

        <Card title="Réductions autorisées">
          <p className="mb-3 text-xs text-muted">Seules ces réductions peuvent être appliquées lors d&apos;une inscription. Modifier un pourcentage ne change pas les inscriptions existantes.</p>
          {discounts.length === 0 && <p className="text-sm text-muted">Aucune réduction configurée.</p>}
          <ul className="space-y-2">
            {discounts.map((d) => (
              <li key={d.id} className="rounded border border-line p-2">
                <details>
                  <summary className="flex cursor-pointer items-center justify-between text-sm">
                    <span>{d.name} <span className="font-semibold text-brand">−{d.percent} %</span> {!d.active && <Badge>désactivée</Badge>}</span>
                    <span className="text-xs text-muted">{d._count.enrollments} inscription(s) ✎</span>
                  </summary>
                  <Form action={saveDiscountType.bind(null, d.id)} className="mt-2 grid grid-cols-2 items-end gap-2">
                    <Input label="Nom" name="name" defaultValue={d.name} />
                    <Input label="Pourcentage" name="percent" type="number" min={1} max={100} defaultValue={d.percent} />
                    <Checkbox label="Active" name="active" defaultChecked={d.active} />
                    <Submit variant="secondary">Enregistrer</Submit>
                  </Form>
                </details>
              </li>
            ))}
          </ul>
          <Form action={saveDiscountType.bind(null, null)} className="mt-4 grid grid-cols-[1fr_110px_auto] items-end gap-2 border-t border-line pt-4" resetOnSuccess>
            <Input label="Nouvelle réduction" name="name" placeholder="ex. Fratrie" />
            <Input label="%" name="percent" type="number" min={1} max={100} />
            <Submit variant="secondary">Ajouter</Submit>
          </Form>
        </Card>
      </div>
      <p className="mt-4 text-xs text-muted">Échéanciers : choisis à l&apos;inscription (mensuel, trimestriel ou annuel) ; les mois facturés et le jour limite se règlent par année dans l&apos;onglet « Centre & années ». Valeur saisie : {moneyInput(45500)} DT = 45 500 millimes, sans arrondi.</p>
    </>
  );
}
