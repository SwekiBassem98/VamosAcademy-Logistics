import { Card, PageHeader, Forbidden, Badge, EmptyState, ApplyButton, Callout } from "@/components/ui";
import { Form, FormActions, Submit } from "@/components/form";
import { FilterField } from "@/components/table-tools";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { buildRecipients, parseTarget } from "@/server/services/messages";
import { missingVariables } from "@/lib/templates";
import { todayISO } from "@/lib/format";
import { prepareMessages } from "../actions";

export const metadata = { title: "Préparer des messages" };

export default async function NewMessages({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  if (!(await pageUser("messages.write"))) return <Forbidden />;
  const sp = await searchParams;
  const [templates, groups] = await Promise.all([
    db.messageTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.group.findMany({ where: { active: true, schoolYear: { active: true } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const template = templates.find((t) => t.id === sp.template);
  const target = parseTarget(sp.target, sp.ids);
  const preview = template && target ? await buildRecipients(template.body, template.audience, target, sp.extra ?? "") : null;

  return (
    <>
      <PageHeader back={{ href: "/messages", label: "Messages" }} title="Préparer des messages" subtitle="1. Choisissez un modèle et des destinataires · 2. Vérifiez chaque texte · 3. Enregistrez : les messages seront « à envoyer » (aucun envoi automatique)." />
      <form className="mb-6 grid items-end gap-3 rounded-lg border border-line bg-white p-3 sm:grid-cols-2 sm:p-4 lg:grid-cols-4">
        {sp.ids && <input type="hidden" name="ids" value={sp.ids} />}
        <FilterField label="1. Modèle">
          <select name="template" defaultValue={template?.id ?? ""} className="input" required>
            <option value="">Choisir…</option>
            {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.audience === "PARENT" ? "parents" : "enseignants"})</option>)}
          </select>
        </FilterField>
        {!sp.ids ? (
          <FilterField label="2. Destinataires">
            <select name="target" defaultValue={sp.target ?? ""} className="input" required>
              <option value="">Choisir…</option>
              <option value="unpaid">Parents des élèves en retard de paiement</option>
              <option value={`absent:${todayISO()}`}>Parents des élèves absents aujourd&apos;hui</option>
              {sp.target?.startsWith("absent:") && sp.target !== `absent:${todayISO()}` && <option value={sp.target}>Absents du {sp.target.slice(7)}</option>}
              <option value="teachers">Tous les enseignants actifs</option>
              {groups.map((g) => <option key={g.id} value={`group:${g.id}`}>Parents du groupe {g.name}</option>)}
            </select>
          </FilterField>
        ) : <p className="text-sm">Destinataires : <strong>{sp.ids.split(",").length} élève(s) sélectionné(s)</strong></p>}
        <FilterField label="Complément (facultatif)">
          <input name="extra" defaultValue={sp.extra ?? ""} maxLength={500} className="input" placeholder="Ajouté à la fin de chaque message" />
        </FilterField>
        <ApplyButton>Aperçu</ApplyButton>
      </form>

      {template && target && preview && (
        preview.recipients.length === 0 ? <EmptyState title="Aucun destinataire" text={preview.skipped.length ? `Ignorés : ${preview.skipped.join(" ; ")}` : "Aucune personne ne correspond à ce choix."} /> : (
          <Card title={`Aperçu : ${preview.recipients.length} message(s) — modèle « ${template.name} »`}>
            {preview.skipped.length > 0 && <Callout tone="warning" className="mb-3">Ignorés : {preview.skipped.join(" ; ")}</Callout>}
            <Form action={prepareMessages} className="space-y-3">
              <input type="hidden" name="templateId" value={template.id} />
              {sp.target && <input type="hidden" name="target" value={sp.target} />}
              {sp.ids && <input type="hidden" name="ids" value={sp.ids} />}
              <input type="hidden" name="extra" value={sp.extra ?? ""} />
              <ul className="divide-y divide-line rounded-md border border-line">
                {preview.recipients.map((r) => {
                  const missing = missingVariables(r.body);
                  return (
                    <li key={r.key}>
                      <label className="flex cursor-pointer gap-3 px-3 py-3 has-[:checked]:bg-brand-50/40">
                      <input type="checkbox" name="keys" value={r.key} defaultChecked={!!r.phone} className="mt-0.5 size-5 shrink-0 accent-brand" aria-label={`Inclure ${r.name}`} />
                      <div className="min-w-0 flex-1 text-sm">
                        <p className="font-medium">{r.name} <span className="text-xs font-normal text-muted">· {r.phone ?? "pas de téléphone"} · {r.context}</span></p>
                        <p className="mt-1 text-sm leading-relaxed text-ink-soft sm:text-xs">{r.body}</p>
                        {missing.length > 0 && <Badge tone="amber" className="mt-1 whitespace-normal">Information manquante : {missing.join(", ")}</Badge>}
                      </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
              <FormActions sticky><Submit>Enregistrer les messages à envoyer</Submit></FormActions>
            </Form>
          </Card>
        )
      )}
    </>
  );
}
