"use server";

import { revalidatePath } from "next/cache";
import { requirePermission, hashPassword } from "@/server/auth";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { runAction, BusinessError, type ActionState } from "@/server/action";
import { userSchema, formToObject } from "@/lib/validation";

export async function saveUser(id: string | null, _: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const me = await requirePermission("users.manage");
    const { password, teacherId, guardianId, ...v } = userSchema.parse(formToObject(fd));
    if (v.role === "ENSEIGNANT" && !teacherId) throw new BusinessError("Associez le compte enseignant à une fiche enseignant.");
    // Évite de créer par erreur un accès administratif pour un enseignant (fiche choisie, rôle laissé sur un autre choix)
    if (v.role !== "ENSEIGNANT" && teacherId) throw new BusinessError("Une fiche enseignant est sélectionnée : choisissez le rôle « Enseignant », ou retirez la fiche pour un compte administratif.");
    if (teacherId && (await db.user.count({ where: { teacherId, ...(id ? { id: { not: id } } : {}) } }))) throw new BusinessError("Cette fiche enseignant a déjà un compte d'accès.");
    if (v.role === "PARENT" && !guardianId) throw new BusinessError("Associez le compte parent à un parent : il ne verra que les enfants de ce parent.");
    if (v.role !== "PARENT" && guardianId) throw new BusinessError("Un parent est sélectionné : choisissez le rôle « Parent », ou retirez le parent de la fiche.");
    if (guardianId && (await db.user.count({ where: { guardianId, ...(id ? { id: { not: id } } : {}) } }))) throw new BusinessError("Ce parent a déjà un compte d'accès.");
    const active = id ? fd.get("active") === "on" : true;
    if (id === me.id && (!active || v.role !== "ADMIN")) throw new BusinessError("Vous ne pouvez pas retirer vos propres droits d'administrateur.");
    const link = v.role === "ENSEIGNANT" ? teacherId : null;
    const guardianLink = v.role === "PARENT" ? guardianId : null;
    if (id) {
      await db.user.update({
        where: { id },
        data: { ...v, teacherId: link, guardianId: guardianLink, active, ...(password ? { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null, mustChangePassword: id !== me.id } : {}) },
      });
      if (password || !active) await db.session.deleteMany({ where: { userId: id } });
    } else {
      if (!password) throw new BusinessError("Mot de passe initial obligatoire.");
      // mot de passe provisoire : l'utilisateur devra le changer à sa première connexion
      id = (await db.user.create({ data: { ...v, teacherId: link, guardianId: guardianLink, passwordHash: await hashPassword(password), mustChangePassword: true } })).id;
    }
    await audit(me.id, "user.save", "User", id, { ...v, active, passwordChanged: !!password });
    revalidatePath("/users");
    return "Utilisateur enregistré.";
  });
}

/** Suppression définitive d'un compte d'accès (le compte courant et le dernier administrateur actif sont protégés). */
export async function deleteUser(id: string): Promise<ActionState> {
  const res = await runAction(async () => {
    const me = await requirePermission("users.manage");
    if (id === me.id) throw new BusinessError("Vous ne pouvez pas supprimer votre propre compte.");
    const u = await db.user.findUnique({ where: { id } });
    if (!u) throw new BusinessError("Ce compte a déjà été supprimé.");
    if (u.role === "ADMIN" && u.active && (await db.user.count({ where: { role: "ADMIN", active: true } })) <= 1) {
      throw new BusinessError("Impossible de supprimer le dernier administrateur actif.");
    }
    await db.user.delete({ where: { id } }); // sessions supprimées en cascade ; le journal d'audit reste, sans lien vers le compte
    await audit(me.id, "user.delete", "User", id, { email: u.email, fullName: u.fullName, role: u.role });
    return "Compte supprimé.";
  });
  revalidatePath("/users");
  return res;
}
