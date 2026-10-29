import "server-only";
import { db, type Tx } from "../db";

/** Matricule séquentiel par année : VA-2026-0001 */
export async function nextStudentCode(tx: Tx | typeof db, yearStart: string) {
  const last = await tx.student.findFirst({
    where: { code: { startsWith: `VA-${yearStart}-` } },
    orderBy: { code: "desc" },
    select: { code: true },
  });
  const n = last ? Number(last.code.split("-")[2]) + 1 : 1;
  return `VA-${yearStart}-${String(n).padStart(4, "0")}`;
}
