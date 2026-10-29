import "server-only";
import type { Prisma } from "@prisma/client";
import { db } from "./db";
import { ForbiddenError, type CurrentUser } from "./auth";

/** Filtre Prisma sur les groupes visibles : un enseignant ne voit que ses groupes. */
export function groupScope(user: CurrentUser): Prisma.GroupWhereInput {
  return user.role === "ENSEIGNANT" ? { teacherId: user.teacherId ?? "__aucun__" } : {};
}

/** Filtre Prisma sur les élèves visibles. */
export function studentScope(user: CurrentUser): Prisma.StudentWhereInput {
  return user.role === "ENSEIGNANT" ? { enrollments: { some: { status: "ACTIVE", group: groupScope(user) } } } : {};
}

export async function canAccessGroup(user: CurrentUser, groupId: string): Promise<boolean> {
  if (user.role !== "ENSEIGNANT") return true;
  return (await db.group.count({ where: { id: groupId, ...groupScope(user) } })) > 0;
}

/** Lève une erreur si l'utilisateur n'a pas accès au groupe (contrôle serveur des actions). */
export async function assertGroupAccess(user: CurrentUser, groupId: string) {
  if (!(await canAccessGroup(user, groupId))) throw new ForbiddenError();
}
