import "server-only";
import type { Prisma } from "@prisma/client";
import { db, type Tx } from "./db";

export async function audit(
  userId: string | null,
  action: string,
  entity: string,
  entityId?: string | null,
  details?: Prisma.InputJsonValue,
  tx: Tx | typeof db = db,
) {
  await tx.auditLog.create({ data: { userId, action, entity, entityId: entityId ?? null, details } });
}
