import { Card, PageHeader } from "@/components/ui";
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
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Compte">
          <dl className="grid grid-cols-[140px_1fr] gap-y-2 text-sm">
            <dt className="text-muted">Nom</dt><dd>{u.fullName}</dd>
            <dt className="text-muted">E-mail</dt><dd>{u.email}</dd>
            <dt className="text-muted">Rôle</dt><dd>{ROLE_LABELS[u.role]}</dd>
            <dt className="text-muted">Dernière connexion</dt><dd>{formatDateTime(u.lastLoginAt)}</dd>
            <dt className="text-muted">Permissions</dt><dd className="font-mono text-xs leading-relaxed">{permissionsOf(u.role).join(", ")}</dd>
          </dl>
        </Card>
        <Card title="Changer mon mot de passe">
          <Form action={changePassword} className="space-y-4" resetOnSuccess>
            <Input label="Mot de passe actuel" name="current" type="password" autoComplete="current-password" />
            <Input label="Nouveau mot de passe" name="next" type="password" autoComplete="new-password" hint="10 caractères minimum, avec lettres et chiffres" />
            <Input label="Confirmer" name="confirm" type="password" autoComplete="new-password" />
            <Submit>Mettre à jour</Submit>
          </Form>
          <p className="mt-3 text-xs text-muted">Vos autres sessions ouvertes seront déconnectées.</p>
        </Card>
      </div>
    </>
  );
}
