import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import type { Role } from "@prisma/client";
import { db } from "./db";
import { can, type Permission } from "@/lib/permissions";
import { audit } from "./audit";

export const SESSION_COOKIE = "vamos_session";
const SESSION_HOURS = 12;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export interface CurrentUser {
  id: string;
  fullName: string;
  email: string;
  role: Role;
  teacherId: string | null;
}

const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

export function hashPassword(p: string) {
  return bcrypt.hash(p, 12);
}

export type LoginResult = { ok: true } | { ok: false; error: string };

export async function login(email: string, password: string): Promise<LoginResult> {
  const generic = { ok: false as const, error: "E-mail ou mot de passe incorrect." };
  const user = await db.user.findUnique({ where: { email } });
  if (!user || !user.active) {
    await bcrypt.compare(password, "$2a$12$abcdefghijklmnopqrstuuJ0zrxk3uTnBNNlUVQx2dM0m3SPoMLuy"); // temps constant
    return generic;
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    return { ok: false, error: "Compte temporairement verrouillé après plusieurs échecs. Réessayez dans 15 minutes." };
  }
  if (!(await bcrypt.compare(password, user.passwordHash))) {
    const failed = user.failedLogins + 1;
    await db.user.update({
      where: { id: user.id },
      data: failed >= MAX_FAILED
        ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) }
        : { failedLogins: failed },
    });
    if (failed >= MAX_FAILED) await audit(user.id, "user.locked", "User", user.id);
    return generic;
  }

  const token = randomBytes(32).toString("base64url");
  await db.$transaction([
    db.session.create({
      data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + SESSION_HOURS * 3600_000) },
    }),
    db.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } }),
    db.session.deleteMany({ where: { userId: user.id, expiresAt: { lt: new Date() } } }),
  ]);
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  await audit(user.id, "user.login", "User", user.id);
  return { ok: true };
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export async function currentSessionTokenHash(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return token ? hashToken(token) : null;
}

/** Utilisateur courant (null si non connecté). Prolonge la session (expiration glissante). */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: true } });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;
  const remaining = session.expiresAt.getTime() - Date.now();
  if (remaining < (SESSION_HOURS / 2) * 3600_000) {
    await db.session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(Date.now() + SESSION_HOURS * 3600_000) },
    });
  }
  const { id, fullName, email, role, teacherId } = session.user;
  return { id, fullName, email, role, teacherId };
});

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

export class ForbiddenError extends Error {
  constructor() {
    super("Accès refusé : vous n'avez pas la permission nécessaire.");
  }
}

/** Pour les pages : retourne l'utilisateur, ou null s'il n'a pas la permission (afficher <Forbidden/>). */
export async function pageUser(permission?: Permission): Promise<CurrentUser | null> {
  const u = await requireUser();
  return !permission || can(u.role, permission) ? u : null;
}

/** À appeler en tête de chaque Server Action protégée. */
export async function requirePermission(permission: Permission): Promise<CurrentUser> {
  const u = await requireUser();
  if (!can(u.role, permission)) throw new ForbiddenError();
  return u;
}
