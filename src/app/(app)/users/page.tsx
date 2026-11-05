import type { User } from "@prisma/client";
import Link from "next/link";
import { Card, PageHeader, Forbidden, Table, Td, Badge, buttonClass } from "@/components/ui";
import { Form, Input, Select, Submit, Checkbox } from "@/components/form";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { ROLE_LABELS } from "@/lib/permissions";
import { formatDateTime } from "@/lib/format";
import { saveUser, deleteUser } from "./actions";
import { ConfirmAction } from "@/components/confirm";

export const metadata = { title: "Utilisateurs" };

export default async function Users({ searchParams }: { searchParams: Promise<{ edit?: string; teacher?: string; guardian?: string }> }) {
  const me = await pageUser("users.manage");
  if (!me) return <Forbidden />;
  const { edit, teacher, guardian } = await searchParams;
  const [users, teachers, guardians] = await Promise.all([
    db.user.findMany({ include: { teacher: true, guardian: true }, orderBy: [{ active: "desc" }, { fullName: "asc" }] }),
    db.teacher.findMany({ where: { active: true }, orderBy: { lastName: "asc" } }),
    db.guardian.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }], take: 1000 }),
  ]);
  const editing = users.find((u) => u.id === edit);
  // « Créer son accès » depuis la fiche enseignant : formulaire pré-rempli, rôle Enseignant
  const forTeacher = !editing ? teachers.find((t) => t.id === teacher && !users.some((u) => u.teacherId === t.id)) : undefined;
  // « Créer l'accès parent » depuis la liste des parents : formulaire pré-rempli, rôle Parent
  const forGuardian = !editing && !forTeacher ? guardians.find((g) => g.id === guardian && !users.some((u) => u.guardianId === g.id)) : undefined;
  const guardianOptions = guardians.map((g) => ({ value: g.id, label: `${g.lastName} ${g.firstName} — ${g.phone}` }));
  const roleOptions = Object.entries(ROLE_LABELS).map(([value, label]) => ({ value, label }));
  const teacherOptions = teachers.map((t) => ({ value: t.id, label: `${t.lastName} ${t.firstName}` }));

  const userForm = (u?: User) => (
    <Form key={u?.id ?? "new"} action={saveUser.bind(null, u?.id ?? null)} className="grid gap-4 sm:grid-cols-2" resetOnSuccess={!u}>
      <Input label="Nom complet *" name="fullName" defaultValue={u?.fullName ?? (forTeacher && `${forTeacher.firstName} ${forTeacher.lastName}`) ?? (forGuardian && `${forGuardian.firstName} ${forGuardian.lastName}`) ?? undefined} />
      <Input label="E-mail (identifiant) *" name="email" type="email" inputMode="email" defaultValue={u?.email ?? forTeacher?.email ?? forGuardian?.email ?? undefined} autoComplete="off" />
      <Select label="Rôle *" name="role" placeholder={u ? undefined : "Choisir un rôle…"} defaultValue={u?.role ?? (forTeacher ? "ENSEIGNANT" : forGuardian ? "PARENT" : "")} options={roleOptions}
        hint="Enseignant : uniquement son espace (emploi du temps, ses classes, appels, notes). Parent : uniquement les informations de ses enfants. Les autres rôles accèdent à l'administration." />
      <Select label="Fiche enseignant (obligatoire pour le rôle Enseignant)" name="teacherId" placeholder="—" defaultValue={u?.teacherId ?? forTeacher?.id ?? ""} options={teacherOptions} />
      <Select label="Parent (obligatoire pour le rôle Parent)" name="guardianId" placeholder="—" defaultValue={u?.guardianId ?? forGuardian?.id ?? ""} options={guardianOptions} />
      <Input label={u ? "Nouveau mot de passe (laisser vide pour conserver)" : "Mot de passe initial *"} name="password" type="password" autoComplete="new-password" hint="10 caractères minimum, lettres et chiffres" />
      {u && <div className="self-end"><Checkbox label="Compte actif" name="active" defaultChecked={u.active} /></div>}
      <div className="flex flex-wrap gap-2 sm:col-span-2"><Submit className="max-sm:w-full">{u ? "Enregistrer" : "Créer le compte"}</Submit>{u && <Link href="/users#compte" className={buttonClass({ variant: "ghost" })}>Annuler</Link>}</div>
    </Form>
  );

  return (
    <>
      <PageHeader title="Utilisateurs & rôles" subtitle="Comptes de l'équipe, des enseignants et des parents. Les permissions sont vérifiées côté serveur pour chaque page et chaque action." />
      <Table head={["Nom", "E-mail", "Rôle", "Dernière connexion", "Statut", ""]} caption="Comptes utilisateurs">
        {users.map((u) => (
          <tr key={u.id}>
            <Td cell="primary" className="font-semibold text-navy">{u.fullName}{u.teacher && <span className="block text-xs text-muted">Fiche : {u.teacher.lastName} {u.teacher.firstName}</span>}{u.guardian && <span className="block text-xs text-muted">Parent : {u.guardian.lastName} {u.guardian.firstName}</span>}</Td>
            <Td className="break-all">{u.email}</Td>
            <Td><Badge tone="blue">{ROLE_LABELS[u.role]}</Badge></Td>
            <Td>{formatDateTime(u.lastLoginAt)}</Td>
            <Td>{u.lockedUntil && u.lockedUntil > new Date() ? <Badge tone="amber">verrouillé</Badge> : <Badge tone={u.active ? "green" : "gray"}>{u.active ? "actif" : "désactivé"}</Badge>}</Td>
            <Td cell="actions"><a href={`/users?edit=${u.id}#compte`} className={buttonClass({ variant: "secondary", size: "sm" })} aria-label={`Modifier le compte de ${u.fullName}`}>Modifier</a>
              {u.id !== me.id && <ConfirmAction action={deleteUser.bind(null, u.id)} small label="Supprimer" ariaLabel={`Supprimer le compte de ${u.fullName}`} title={`Supprimer le compte de ${u.fullName} ?`}
                message={<>Le compte <strong>{u.email}</strong> sera supprimé définitivement et la personne ne pourra plus se connecter. Le journal d&apos;audit est conservé.</>} confirmLabel="Supprimer le compte" />}</Td>
          </tr>
        ))}
      </Table>
      <Card id="compte" title={editing ? `Modifier — ${editing.fullName}` : forTeacher ? `Accès enseignant — ${forTeacher.firstName} ${forTeacher.lastName}` : forGuardian ? `Accès parent — ${forGuardian.firstName} ${forGuardian.lastName}` : "Nouveau compte"} className="mt-6 scroll-mt-20">
        {userForm(editing)}
      </Card>
    </>
  );
}
