import { Card, PageHeader, Forbidden, Badge, Button } from "@/components/ui";
import { Form, Input, Submit, Textarea, Checkbox } from "@/components/form";
import { ConfirmAction } from "@/components/confirm";
import { can } from "@/lib/permissions";
import { demoCounts } from "@/server/services/demo";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { formatDate, formatPeriod } from "@/lib/format";
import { activateYear, createSchoolYear, generateInvoices, saveSettings, updateYearBilling, saveDiscountType, purgeDemo } from "./actions";

export const metadata = { title: "Paramètres" };

function monthsBetween(start: Date, end: Date): string[] {
  const out: string[] = [];
  const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
  const stop = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  while (d <= stop) {
    out.push(d.toISOString().slice(0, 7));
    d.setUTCMonth(d.getUTCMonth() + 1);
  }
  return out;
}

export default async function Settings() {
  const user = await pageUser("settings.manage");
  if (!user) return <Forbidden />;
  const [c, years, discounts, demo] = await Promise.all([
    db.centerSettings.findUnique({ where: { id: 1 } }),
    db.schoolYear.findMany({ orderBy: { label: "desc" } }),
    db.discountType.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { enrollments: true } } } }),
    demoCounts(),
  ]);
  return (
    <>
      <PageHeader title="Paramètres du centre" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Informations (en-tête des reçus)">
          <Form action={saveSettings} className="space-y-4">
            <Input label="Nom" name="name" defaultValue={c?.name} />
            <Input label="Adresse (FR)" name="addressFr" defaultValue={c?.addressFr} />
            <Input label="Adresse (AR)" name="addressAr" dir="rtl" defaultValue={c?.addressAr} />
            <div className="grid grid-cols-2 gap-4">
              <Input label="Téléphone" name="phone" defaultValue={c?.phone} />
              <Input label="E-mail" name="email" type="email" defaultValue={c?.email ?? ""} />
            </div>
            <Textarea label="Pied de page des reçus" name="receiptFooter" defaultValue={c?.receiptFooter} />
            <Submit />
          </Form>
        </Card>
        <Card title="Nouvelle année scolaire">
          <Form action={createSchoolYear} className="grid grid-cols-2 gap-4" resetOnSuccess>
            <Input label="Libellé" name="label" placeholder="2027-2028" />
            <Input label="Jour limite de paiement" name="dueDay" type="number" min={1} max={28} defaultValue={10} />
            <Input label="Début" name="startDate" type="date" />
            <Input label="Fin" name="endDate" type="date" />
            <Submit variant="secondary">Créer</Submit>
          </Form>
          <p className="mt-3 text-xs text-muted">La réinscription en masse vers une nouvelle année est prévue (blueprint E7).</p>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
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
        {can(user.role, "users.manage") && (
          <Card title="Données de démonstration">
            <p className="text-sm text-gray-700">Les données fictives sont marquées <Badge tone="amber">DÉMO</Badge> partout dans l&apos;application et n&apos;apparaissent jamais comme réelles sur les documents (mention imprimée).</p>
            <p className="mt-2 text-sm">Actuellement : <strong>{demo.students}</strong> élève(s), <strong>{demo.guardians}</strong> parent(s), <strong>{demo.teachers}</strong> enseignant(s), <strong>{demo.groups}</strong> groupe(s), <strong>{demo.expenses}</strong> dépense(s) de démonstration.</p>
            {demo.total > 0 ? (
              <div className="mt-4">
                <ConfirmAction action={purgeDemo} label="Supprimer les données de démonstration" title="Supprimer définitivement les données de démonstration ?" withReason="Tapez SUPPRIMER pour confirmer"
                  message="Seules les données marquées DÉMO sont supprimées (avec leurs paiements, présences et notes). Les données réelles ne sont pas touchées." confirmLabel="Supprimer" />
              </div>
            ) : <p className="mt-3 text-sm text-emerald-700">Aucune donnée de démonstration : la base ne contient que des données réelles.</p>}
          </Card>
        )}
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold text-navy">Années scolaires</h2>
      <div className="space-y-4">
        {years.map((y) => {
          const candidates = monthsBetween(y.startDate, y.endDate);
          const set = new Set(y.billingMonths);
          return (
            <Card key={y.id} title={<span className="flex items-center gap-2">{y.label} {y.active && <Badge tone="green">active</Badge>}</span>}
              actions={!y.active && <form action={activateYear.bind(null, y.id)}><Button variant="secondary" className="py-1 text-xs">Activer</Button></form>}>
              <p className="mb-3 text-sm text-muted">Du {formatDate(y.startDate)} au {formatDate(y.endDate)}</p>
              <Form action={updateYearBilling.bind(null, y.id)} className="space-y-3">
                <fieldset>
                  <legend className="mb-2 text-sm font-medium text-gray-700">Mois facturés</legend>
                  <div className="flex flex-wrap gap-2">
                    {candidates.map((m) => (
                      <label key={m} className="flex items-center gap-1.5 rounded border border-line px-2 py-1 text-xs capitalize">
                        <input type="checkbox" name="months" value={m} defaultChecked={set.has(m)} className="accent-brand" /> {formatPeriod(m)}
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="flex items-end gap-3">
                  <Input label="Jour limite" name="dueDay" type="number" min={1} max={28} defaultValue={y.dueDay} wrapperClass="w-32" />
                  <Submit variant="secondary">Enregistrer</Submit>
                </div>
              </Form>
              <Form action={generateInvoices.bind(null, y.id)} className="mt-4 border-t border-line pt-4">
                <p className="mb-2 text-xs text-muted">Crée les échéances manquantes pour toutes les inscriptions actives (sans doublon).</p>
                <Submit variant="secondary">Générer les échéances</Submit>
              </Form>
            </Card>
          );
        })}
      </div>
    </>
  );
}
