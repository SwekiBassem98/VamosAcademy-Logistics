import "server-only";
import { db } from "../db";
import { isLate } from "@/lib/billing";
import { formatDate, parseDay, todayISO } from "@/lib/format";

type Params = Record<string, string | undefined>;
const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

export type ReportFilters = {
  from: string; to: string; yearId: string | null; groupId: string | null; levelId: string | null;
  label: string; groupName: string | null; levelName: string | null; preset: string;
};

/** Période : mois (AAAA-MM), année scolaire, ou dates libres ; filtres facultatifs niveau / groupe. */
export async function reportFilters(p: Params): Promise<ReportFilters> {
  const year = p.year ? await db.schoolYear.findUnique({ where: { id: p.year } }) : await db.schoolYear.findFirst({ where: { active: true } });
  const isDay = (s?: string) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? "");
  let from: string, to: string, label: string, preset: string;
  if (/^\d{4}-\d{2}$/.test(p.month ?? "")) {
    const [y, m] = p.month!.split("-").map(Number);
    from = `${p.month}-01`;
    to = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
    label = `Mois de ${MONTHS[m - 1]} ${y}`;
    preset = "month";
  } else if (isDay(p.from) && isDay(p.to)) {
    from = p.from! <= p.to! ? p.from! : p.to!;
    to = p.from! <= p.to! ? p.to! : p.from!;
    label = `Du ${formatDate(parseDay(from))} au ${formatDate(parseDay(to))}`;
    preset = "custom";
  } else {
    from = year ? year.startDate.toISOString().slice(0, 10) : `${todayISO().slice(0, 4)}-01-01`;
    to = year ? year.endDate.toISOString().slice(0, 10) : todayISO();
    label = `Année scolaire ${year?.label ?? ""}`;
    preset = "year";
  }
  const [group, level] = await Promise.all([
    p.group ? db.group.findUnique({ where: { id: p.group }, select: { name: true } }) : null,
    p.level ? db.level.findUnique({ where: { id: p.level }, select: { name: true } }) : null,
  ]);
  return { from, to, yearId: year?.id ?? null, groupId: group ? p.group! : null, levelId: level ? p.level! : null, label, groupName: group?.name ?? null, levelName: level?.name ?? null, preset };
}

export type MonthRow = { key: string; label: string; billed: number; cashed: number; spent: number; payroll: number; result: number; overdue: number };

/**
 * Rapport financier sur la période. Avec un filtre niveau/groupe, les encaissements sont ceux affectés aux
 * échéances de ces groupes ; les dépenses (non rattachées à un groupe) ne sont alors pas déduites.
 */
export async function financialReport(f: ReportFilters) {
  const start = parseDay(f.from);
  const end = new Date(parseDay(f.to).getTime() + 12 * 3600_000);
  const scoped = !!(f.groupId || f.levelId);
  const groupWhere = { ...(f.yearId ? { schoolYearId: f.yearId } : {}), ...(f.groupId ? { id: f.groupId } : {}), ...(f.levelId ? { levelId: f.levelId } : {}) };

  const [invoices, allocations, expenses] = await Promise.all([
    db.invoice.findMany({
      where: { cancelledAt: null, dueDate: { gte: start, lte: end }, enrollment: { group: groupWhere } },
      select: { amount: true, dueDate: true, allocations: { where: { payment: { cancelledAt: null } }, select: { amount: true } }, enrollment: { select: { group: { select: { id: true, name: true } } } } },
    }),
    db.paymentAllocation.findMany({
      where: { payment: { cancelledAt: null, paidAt: { gte: start, lte: end } }, invoice: { enrollment: { group: groupWhere } } },
      select: { amount: true, payment: { select: { paidAt: true, mode: { select: { label: true } } } }, invoice: { select: { enrollment: { select: { group: { select: { id: true, name: true } } } } } } },
    }),
    scoped ? [] : db.expense.findMany({
      where: { cancelledAt: null, spentAt: { gte: start, lte: end }, ...(f.yearId ? { schoolYearId: f.yearId } : {}) },
      select: { amount: true, spentAt: true, teacherPayId: true, category: { select: { name: true } } },
    }),
  ]);

  const months = new Map<string, MonthRow>();
  const [fy, fm] = f.from.split("-").map(Number);
  for (let d = new Date(Date.UTC(fy, fm - 1, 1)); d <= end; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    const key = d.toISOString().slice(0, 7);
    months.set(key, { key, label: `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`, billed: 0, cashed: 0, spent: 0, payroll: 0, result: 0, overdue: 0 });
  }
  const key = (d: Date) => todayISO(d).slice(0, 7);
  const byGroup = new Map<string, { name: string; billed: number; cashed: number; overdue: number }>();
  const g = (id: string, name: string) => byGroup.get(id) ?? byGroup.set(id, { name, billed: 0, cashed: 0, overdue: 0 }).get(id)!;
  const now = new Date();
  for (const i of invoices) {
    const m = months.get(key(i.dueDate));
    const paid = i.allocations.reduce((s, a) => s + a.amount, 0);
    const late = isLate(i.dueDate, now) ? Math.max(0, i.amount - paid) : 0;
    if (m) { m.billed += i.amount; m.overdue += late; }
    const gr = g(i.enrollment.group.id, i.enrollment.group.name);
    gr.billed += i.amount;
    gr.overdue += late;
  }
  const byMode = new Map<string, number>();
  for (const a of allocations) {
    const m = months.get(key(a.payment.paidAt));
    if (m) m.cashed += a.amount;
    g(a.invoice.enrollment.group.id, a.invoice.enrollment.group.name).cashed += a.amount;
    byMode.set(a.payment.mode.label, (byMode.get(a.payment.mode.label) ?? 0) + a.amount);
  }
  const byCategory = new Map<string, number>();
  for (const e of expenses) {
    const m = months.get(key(e.spentAt));
    if (m) { if (e.teacherPayId) m.payroll += e.amount; else m.spent += e.amount; }
    byCategory.set(e.category.name, (byCategory.get(e.category.name) ?? 0) + e.amount);
  }
  const rows = [...months.values()].map((m) => ({ ...m, result: m.cashed - m.spent - m.payroll }));
  const total = rows.reduce((t, m) => ({ billed: t.billed + m.billed, cashed: t.cashed + m.cashed, spent: t.spent + m.spent, payroll: t.payroll + m.payroll, result: t.result + m.result, overdue: t.overdue + m.overdue }),
    { billed: 0, cashed: 0, spent: 0, payroll: 0, result: 0, overdue: 0 });
  const sortDesc = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return {
    months: rows, total, scoped,
    byCategory: sortDesc(byCategory), byMode: sortDesc(byMode),
    byGroup: [...byGroup.values()].sort((a, b) => b.cashed - a.cashed),
    collectionRate: total.billed ? Math.round(((total.billed - total.overdue) / total.billed) * 100) : null,
  };
}
