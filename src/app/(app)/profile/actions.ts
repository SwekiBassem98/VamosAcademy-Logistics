"use server";

import bcrypt from "bcryptjs";
import { requireUser, hashPassword, currentSessionTokenHash } from "@/server/auth";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { runAction, BusinessError, type ActionState } from "@/server/action";
import { passwordChangeSchema, formToObject } from "@/lib/validation";
import { hit } from "@/server/rate-limit";

export async function changePassword(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    if (!(await hit(`pwd:${user.id}`, 10, 15 * 60_000)).allowed) throw new BusinessError("Trop de tentatives. Réessayez dans quelques minutes.");
    const v = passwordChangeSchema.parse(formToObject(fd));
    if (v.next === v.current) throw new BusinessError("Le nouveau mot de passe doit être différent de l'actuel.");
    const u = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await bcrypt.compare(v.current, u.passwordHash))) throw new BusinessError("Mot de passe actuel incorrect.");
    const keep = await currentSessionTokenHash();
    await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(v.next), mustChangePassword: false } });
    await db.session.deleteMany({ where: { userId: u.id, NOT: { tokenHash: keep ?? "" } } });
    await audit(u.id, "user.password", "User", u.id);
    return "Mot de passe modifié.";
  });
}
