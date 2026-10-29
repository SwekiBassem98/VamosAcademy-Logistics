import "server-only";
import type { Prisma } from "@prisma/client";
import { parseDay, todayISO } from "@/lib/format";

type Params = Record<string, string | undefined>;

const isDay = (s?: string) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");

/** Filtre commun (liste, totaux, exports) : période, recherche, moyen, état, année, niveau, groupe. */
export function paymentWhere(params: Params): { where: Prisma.PaymentWhereInput; from: string; to: string } {
  const today = todayISO();
  const from = isDay(params.from) ? params.from! : `${today.slice(0, 8)}01`;
  const to = isDay(params.to) ? params.to! : today;
  const { q, mode, state, year, level, group } = params;
  const where: Prisma.PaymentWhereInput = {
    paidAt: { gte: parseDay(from), lte: new Date(parseDay(to).getTime() + 12 * 3600_000) },
    ...(mode ? { modeId: mode } : {}),
    ...(state === "cancelled" ? { cancelledAt: { not: null } } : state === "valid" ? { cancelledAt: null } : {}),
    ...(year ? { schoolYearId: year } : {}),
    ...(level || group ? { allocations: { some: { invoice: { enrollment: { group: { ...(group ? { id: group } : {}), ...(level ? { levelId: level } : {}) } } } } } } : {}),
    ...(q ? { OR: [{ receiptNo: { contains: q, mode: "insensitive" } }, { reference: { contains: q, mode: "insensitive" } }, { student: { OR: [{ lastName: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }] } }] } : {}),
  };
  return { where, from, to };
}


/** Filtre des dépenses : période, catégorie, moyen, état (valides, annulées, sans justificatif), recherche. */
export function expenseWhere(params: Params): { where: Prisma.ExpenseWhereInput; from: string; to: string } {
  const today = todayISO();
  const from = isDay(params.from) ? params.from! : `${today.slice(0, 8)}01`;
  const to = isDay(params.to) ? params.to! : today;
  const { q, category, mode, state, year } = params;
  const where: Prisma.ExpenseWhereInput = {
    spentAt: { gte: parseDay(from), lte: new Date(parseDay(to).getTime() + 12 * 3600_000) },
    ...(category ? { categoryId: category } : {}),
    ...(mode ? { modeId: mode } : {}),
    ...(year ? { schoolYearId: year } : {}),
    ...(state === "valid" ? { cancelledAt: null } : state === "cancelled" ? { cancelledAt: { not: null } } : state === "nodoc" ? { cancelledAt: null, attachments: { none: {} }, teacherPayId: null } : {}),
    ...(q ? { OR: [{ label: { contains: q, mode: "insensitive" } }, { reference: { contains: q, mode: "insensitive" } }] } : {}),
  };
  return { where, from, to };
}
