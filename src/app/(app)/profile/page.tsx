import { Card, PageHeader, DescriptionList, Badge } from "@/components/ui";
import { Form, Input, Submit } from "@/components/form";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { ROLE_LABELS, permissionsOf } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { changePassword } from "./actions";

export const metadata = { title: "Mon profil" };

export default async function Profile() {
  const user = await requireUser();
  const u = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  return (
    <>
      <PageHeader title="Mon profil" />
      {u.mustChangePassword && (
        <p role="alert" className="mb-4 rounded-md border border-warning-600/25 bg-warning-50 px-3.5 py-2.5 text-sm text-warning-700">
          Pour des raisons de sécurité, vous devez choisir un nouveau mot de passe personnel avant d&apos;utiliser l&apos;application.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Compte">
          <DescriptionList items={[
            ["Nom", u.fullName],
            ["E-mail", u.email],
            ["Rôle", <Badge key="r" tone="blue">{ROLE_LABELS[u.role]}</Badge>],
            ["Dernière connexion", formatDateTime(u.lastLoginAt)],
            ["Permissions", <span key="p" className="flex flex-wrap gap-1">{permissionsOf(u.role).map((p) => <code key={p} className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px]">{p}</code>)}</span>],
          ]} />
        </Card>
        <Card title="Changer mon mot de passe">
          <Form action={changePassword} className="space-y-4" resetOnSuccess>
            <Input label="Mot de passe actuel" name="current" type="password" autoComplete="current-password" />
            <Input label="Nouveau mot de passe" name="next" type="password" autoComplete="new-password" hint="10 caractères minimum, avec lettres et chiffres" />
            <Input label="Confirmer" name="confirm" type="password" autoComplete="new-password" />
            <Submit className="max-sm:w-full">Mettre à jour</Submit>
          </Form>
          <p className="mt-3 text-xs text-muted">Vos autres sessions ouvertes seront déconnectées.</p>
        </Card>
      </div>
    </>
  );
}
