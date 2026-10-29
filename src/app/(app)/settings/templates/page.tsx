import { Card, PageHeader, Forbidden, Badge } from "@/components/ui";
import { Form, Input, Textarea, Submit, Checkbox } from "@/components/form";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { availableChannels } from "@/server/messaging";
import { TEMPLATE_VARIABLES } from "@/lib/templates";
import { SettingsTabs } from "../tabs";
import { saveTemplate } from "../actions";

export const metadata = { title: "Modèles de messages" };

export default async function Templates() {
  if (!(await pageUser("settings.manage"))) return <Forbidden />;
  const templates = await db.messageTemplate.findMany({ orderBy: { name: "asc" } });
  const channels = availableChannels();
  return (
    <>
      <PageHeader title="Paramètres du centre" />
      <SettingsTabs active="templates" />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {templates.map((t) => (
            <Card key={t.id} title={<span className="flex items-center gap-2">{t.name} <Badge tone="blue">{t.audience === "PARENT" ? "Parents" : "Enseignants"}</Badge> {!t.active && <Badge>désactivé</Badge>}</span>}>
              <Form action={saveTemplate.bind(null, t.id)} className="space-y-3">
                <Input label="Nom" name="name" defaultValue={t.name} />
                <Textarea label="Texte" name="body" defaultValue={t.body} rows={4} />
                <div className="flex items-center justify-between">
                  <Checkbox label="Actif" name="active" defaultChecked={t.active} />
                  <Submit variant="secondary">Enregistrer</Submit>
                </div>
              </Form>
            </Card>
          ))}
        </div>
        <div className="space-y-4">
          <Card title="Variables disponibles">
            <ul className="space-y-1 text-sm">{Object.entries(TEMPLATE_VARIABLES).map(([k, v]) => <li key={k}><code className="rounded bg-gray-100 px-1 text-xs">{`{${k}}`}</code> {v}</li>)}</ul>
            <p className="mt-3 text-xs text-muted">Une variable sans valeur apparaît entre crochets dans le message préparé pour être corrigée avant l&apos;envoi.</p>
          </Card>
          <Card title="Canaux d'envoi">
            <ul className="space-y-2 text-sm">
              {channels.map((c) => <li key={c.channel} className="flex items-center justify-between gap-2"><span>{c.label}</span><Badge tone={c.enabled ? "green" : "gray"}>{c.enabled ? "actif" : "non configuré"}</Badge></li>)}
            </ul>
            <p className="mt-3 text-xs text-muted">Aucun envoi automatique (SMS, WhatsApp, e-mail) n&apos;est effectué : les messages sont préparés puis envoyés par l&apos;équipe, qui confirme l&apos;envoi. Un fournisseur pourra être branché après accord explicite (voir <code>src/server/messaging</code>).</p>
          </Card>
        </div>
      </div>
    </>
  );
}
