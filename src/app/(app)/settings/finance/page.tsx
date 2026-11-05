import Link from "next/link";
import { Card, PageHeader, Forbidden, Badge, Callout } from "@/components/ui";
import { Form, Input, Submit, Checkbox } from "@/components/form";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { moneyInput } from "@/lib/format";
import { SettingsTabs } from "../tabs";
import { savePaymentMode } from "../actions";

export const metadata = { title: "Moyens de paiement" };

export default async function FinanceSettings() {
  if (!(await pageUser("settings.manage"))) return <Forbidden />;
  const modes = await db.paymentMode.findMany({ orderBy: [{ order: "asc" }], include: { _count: { select: { payments: true } } } });

  return (
    <>
      <PageHeader title="Paramètres du centre" />
      <SettingsTabs active="finance" />

      <Callout tone="info" className="mb-6">La grille tarifaire et les réductions se gèrent désormais dans <Link href="/tarifs" className="font-semibold underline">Tarifs &amp; réductions</Link>.</Callout>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Moyens de paiement">
          <p className="mb-3 text-xs text-muted">Utilisés pour les encaissements, dépenses et rémunérations. Un moyen déjà utilisé ne peut pas être supprimé, seulement désactivé.</p>
          <ul className="space-y-2">
            {modes.map((m) => (
              <li key={m.id} className="rounded-md border border-line px-3 py-1">
                <details>
                  <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm">
                    <span>{m.label} <span className="font-mono text-xs text-muted">{m.code}</span> {m.requiresReference && <Badge tone="blue">réf. requise</Badge>} {!m.active && <Badge>désactivé</Badge>}</span>
                    <span className="shrink-0 text-xs text-muted">{m._count.payments} paiement(s) · <span className="font-semibold text-brand">Modifier</span></span>
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

      </div>
      <p className="mt-4 text-xs text-muted">Échéanciers : choisis à l&apos;inscription (mensuel, trimestriel ou annuel) ; les mois facturés et le jour limite se règlent par année dans l&apos;onglet « Centre & années ». Valeur saisie : {moneyInput(45500)} DT = 45 500 millimes, sans arrondi.</p>
    </>
  );
}
