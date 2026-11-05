import "server-only";
import type { Prisma } from "@prisma/client";

/**
 * Plus grand numéro de reçu déjà émis puis supprimé avec un élève ou un enseignant (conservé dans le journal d'audit).
 * Un numéro imprimé et remis à une famille ou à un enseignant ne doit jamais resservir pour un autre paiement.
 */
export async function highestDeletedReceipt(tx: Prisma.TransactionClient, action: "student.delete" | "teacher.delete", prefix: string): Promise<number> {
  const logs = await tx.auditLog.findMany({ where: { action }, select: { details: true } });
  let max = 0;
  for (const l of logs) {
    const nos = (l.details as { receiptNos?: string[] } | null)?.receiptNos ?? [];
    for (const no of nos) if (no.startsWith(prefix)) max = Math.max(max, Number(no.slice(prefix.length)) || 0);
  }
  return max;
}
