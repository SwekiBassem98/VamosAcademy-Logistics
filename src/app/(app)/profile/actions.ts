"use server";

import bcrypt from "bcryptjs";
import { requireUser, hashPassword, currentSessionTokenHash } from "@/server/auth";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { runAction, BusinessError, type ActionState } from "@/server/action";
import { passwordChangeSchema, formToObject } from "@/lib/validation";

export async function changePassword(_: ActionState, fd: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireUser();
    const v = passwordChangeSchema.parse(formToObject(fd));
    const u = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!(await bcrypt.compare(v.current, u.passwordHash))) throw new BusinessError("Mot de passe actuel incorrect.");
    const keep = await currentSessionTokenHash();
    await db.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(v.next) } });
    await db.session.deleteMany({ where: { userId: u.id, NOT: { tokenHash: keep ?? "" } } });
    await audit(u.id, "user.password", "User", u.id);
    return "Mot de passe modifié.";
  });
}
