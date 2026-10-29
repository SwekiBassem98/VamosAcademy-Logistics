import type { User } from "@prisma/client";
import { Card, PageHeader, Forbidden, Table, Td, Badge } from "@/components/ui";
import { Form, Input, Select, Submit, Checkbox } from "@/components/form";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { ROLE_LABELS } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { saveUser } from "./actions";

export const metadata = { title: "Utilisateurs" };

export default async function Users({ searchParams }: { searchParams: Promise<{ edit?: string }> }) {
  if (!(await pageUser("users.manage"))) return <Forbidden />;
  const { edit } = await searchParams;
  const [users, teachers] = await Promise.all([
    db.user.findMany({ include: { teacher: true }, orderBy: [{ active: "desc" }, { fullName: "asc" }] }),
    db.teacher.findMany({ where: { active: true }, orderBy: { lastName: "asc" } }),
  ]);
  const editing = users.find((u) => u.id === edit);
  const roleOptions = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));
  const teacherOptions = teachers.map((t) => ({ value: t.id, label: `${t.lastName} ${t.firstName}` }));

  const UserForm = ({ u }: { u?: User }) => (
    <Form action={saveUser.bind(null, u?.id ?? null)} className="grid gap-4 sm:grid-cols-2" resetOnSuccess={!u}>
      <Input label="Nom complet *" name="fullName" defaultValue={u?.fullName} />
      <Input label="E-mail (identifiant) *" name="email" type="email" defaultValue={u?.email} autoComplete="off" />
      <Select label="Rôle *" name="role" defaultValue={u?.role ?? "RESPONSABLE"} options={roleOptions} />
      <Select label="Fiche enseignant (rôle Enseignant)" name="teacherId" placeholder="—" defaultValue={u?.teacherId ?? ""} options={teacherOptions} />
      <Input label={u ? "Nouveau mot de passe (laisser vide pour conserver)" : "Mot de passe initial *"} name="password" type="password" autoComplete="new-password" hint="10 caractères minimum, lettres et chiffres" />
      {u && <div className="self-end"><Checkbox label="Compte actif" name="active" defaultChecked={u.active} /></div>}
      <div className="sm:col-span-2"><Submit>{u ? "Enregistrer" : "Créer le compte"}</Submit></div>
    </Form>
  );

  return (
    <>
      <PageHeader title="Utilisateurs & rôles" subtitle="Comptes internes uniquement. Les permissions sont vérifiées côté serveur pour chaque page et chaque action." />
      <Table head={["Nom", "E-mail", "Rôle", "Dernière connexion", "Statut", ""]}>
        {users.map((u) => (
          <tr key={u.id}>
            <Td className="font-medium text-navy">{u.fullName}{u.teacher && <span className="block text-xs text-muted">Fiche : {u.teacher.lastName} {u.teacher.firstName}</span>}</Td>
            <Td>{u.email}</Td>
            <Td><Badge tone="blue">{ROLE_LABELS[u.role]}</Badge></Td>
            <Td>{formatDateTime(u.lastLoginAt)}</Td>
            <Td>{u.lockedUntil && u.lockedUntil > new Date() ? <Badge tone="amber">verrouillé</Badge> : <Badge tone={u.active ? "green" : "gray"}>{u.active ? "actif" : "désactivé"}</Badge>}</Td>
            <Td><a href={`/users?edit=${u.id}`} className="text-xs text-brand">Modifier</a></Td>
          </tr>
        ))}
      </Table>
      <Card title={editing ? `Modifier — ${editing.fullName}` : "Nouveau compte"} className="mt-6">
        <UserForm key={editing?.id ?? "new"} u={editing} />
      </Card>
    </>
  );
}
