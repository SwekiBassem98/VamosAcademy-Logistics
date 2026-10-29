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
    const { password, teacherId, ...v } = userSchema.parse(formToObject(fd));
    if (v.role === "ENSEIGNANT" && !teacherId) throw new BusinessError("Associez le compte enseignant à une fiche enseignant.");
    const active = id ? fd.get("active") === "on" : true;
    if (id === me.id && (!active || v.role !== "ADMIN")) throw new BusinessError("Vous ne pouvez pas retirer vos propres droits d'administrateur.");
    const link = v.role === "ENSEIGNANT" ? teacherId : null;
    if (id) {
      await db.user.update({
        where: { id },
        data: { ...v, teacherId: link, active, ...(password ? { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null, mustChangePassword: id !== me.id } : {}) },
      });
      if (password || !active) await db.session.deleteMany({ where: { userId: id } });
    } else {
      if (!password) throw new BusinessError("Mot de passe initial obligatoire.");
      // mot de passe provisoire : l'utilisateur devra le changer à sa première connexion
      id = (await db.user.create({ data: { ...v, teacherId: link, passwordHash: await hashPassword(password), mustChangePassword: true } })).id;
    }
    await audit(me.id, "user.save", "User", id, { ...v, active, passwordChanged: !!password });
    revalidatePath("/users");
    return "Utilisateur enregistré.";
  });
}
