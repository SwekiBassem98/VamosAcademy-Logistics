import "server-only";
import ExcelJS from "exceljs";
import { db } from "./db";
import type { CurrentUser } from "./auth";
import { canAccessGroup } from "./scope";
import { paymentWhere, expenseWhere } from "./filters";
import { studentStatement, unpaidSummary } from "./services/finance";
import { financialReport, reportFilters } from "./services/reports";
import { can, type Permission } from "@/lib/permissions";
import { formatDate, formatDateTime, todayISO } from "@/lib/format";
import { PAY_STATUS_LABEL } from "@/lib/payroll";

type Cell = string | number | null | undefined;
export type Column = { header: string; money?: boolean; width?: number };
export type Table = { title: string; subtitle?: string; columns: Column[]; rows: Cell[][] };
type Params = Record<string, string | undefined>;

/** Montant en millimes → nombre en dinars pour le tableur ; reste exact à 3 décimales. */
const dt = (millimes: number) => millimes / 1000;

const PERM: Record<string, Permission> = {
  students: "students.write", payments: "payments.read", unpaid: "payments.read", expenses: "expenses.read",
  statement: "payments.read", report: "reports.read", group: "academics.read", payroll: "expenses.read",
};

export async function buildTable(kind: string, p: Params, user: CurrentUser): Promise<Table | "forbidden" | null> {
  const perm = PERM[kind];
  if (!perm) return null;
  if (!can(user.role, perm)) return "forbidden";

  switch (kind) {
    case "students": {
      const valid = ["PREINSCRIT", "ACTIF", "SUSPENDU", "ARCHIVE"].includes(p.status ?? "");
      const ids = p.ids?.split(",").filter(Boolean);
      const list = await db.student.findMany({
        where: { ...(ids?.length ? { id: { in: ids } } : valid ? { status: p.status as "ACTIF" } : { status: { not: "ARCHIVE" } }) },
        include: { level: true, guardians: { include: { guardian: true }, orderBy: { isPayer: "desc" } }, enrollments: { where: { status: "ACTIVE" }, include: { group: true } } },
        orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
      });
      return {
        title: "Liste des élèves",
        columns: [{ header: "Matricule" }, { header: "Nom" }, { header: "Prénom" }, { header: "Nom arabe" }, { header: "Naissance" }, { header: "Niveau" }, { header: "Classe" }, { header: "Établissement" }, { header: "Groupes" }, { header: "Statut" }, { header: "Parent" }, { header: "Téléphone parent" }, { header: "Démo" }],
        rows: list.map((s) => {
          const g = s.guardians[0]?.guardian;
          return [s.code, s.lastName, s.firstName, s.fullNameAr, s.birthDate ? formatDate(s.birthDate) : "", s.level?.name, s.className, s.school,
            s.enrollments.map((e) => e.group.name).join(", "), s.status, g ? `${g.lastName} ${g.firstName}` : "", g?.phone, s.isDemo ? "oui" : ""];
        }),
      };
    }
    case "payments": {
      const { where, from, to } = paymentWhere(p);
      const list = await db.payment.findMany({ where, include: { student: true, mode: true }, orderBy: [{ paidAt: "asc" }, { receiptNo: "asc" }] });
      return {
        title: "Paiements", subtitle: `Du ${formatDate(new Date(from))} au ${formatDate(new Date(to))}`,
        columns: [{ header: "Reçu" }, { header: "Date" }, { header: "Matricule" }, { header: "Élève" }, { header: "Moyen" }, { header: "Référence" }, { header: "Montant (DT)", money: true }, { header: "État" }, { header: "Motif annulation" }],
        rows: list.map((x) => [x.receiptNo, formatDate(x.paidAt), x.student.code, `${x.student.lastName} ${x.student.firstName}`, x.mode.label, x.reference, dt(x.amount), x.cancelledAt ? "annulé" : "valide", x.cancelReason]),
      };
    }
    case "unpaid": {
      const year = await db.schoolYear.findFirst({ where: { active: true } });
      const list = year ? await unpaidSummary(year.id, new Date(), { groupId: p.group, levelId: p.level, minDays: Number(p.minDays) || undefined }) : [];
      return {
        title: "État des impayés", subtitle: `Année ${year?.label ?? "—"} — échéances échues au ${formatDate(new Date())}`,
        columns: [{ header: "Matricule" }, { header: "Élève" }, { header: "Niveau" }, { header: "Groupes" }, { header: "Parent" }, { header: "Téléphone" }, { header: "Échéances" }, { header: "Plus ancienne" }, { header: "Montant dû (DT)", money: true }],
        rows: list.map((u) => {
          const g = u.student.guardians[0]?.guardian;
          return [u.student.code, `${u.student.lastName} ${u.student.firstName}`, u.student.level?.name, [...u.groups].join(", "), g ? `${g.lastName} ${g.firstName}` : "", g?.phone, u.count, formatDate(u.oldest), dt(u.due)];
        }),
      };
    }
    case "expenses": {
      const { where, from, to } = expenseWhere(p);
      const list = await db.expense.findMany({ where, include: { category: true, mode: true, _count: { select: { attachments: true } } }, orderBy: { spentAt: "asc" } });
      return {
        title: "Dépenses", subtitle: `Du ${formatDate(new Date(from))} au ${formatDate(new Date(to))}`,
        columns: [{ header: "Date" }, { header: "Catégorie" }, { header: "Libellé" }, { header: "Moyen" }, { header: "Référence" }, { header: "Montant (DT)", money: true }, { header: "Justificatifs" }, { header: "État" }, { header: "Motif" }],
        rows: list.map((e) => [formatDate(e.spentAt), e.category.name, e.label, e.mode.label, e.reference, dt(e.amount), e._count.attachments, e.cancelledAt ? "annulée" : "valide", e.cancelReason]),
      };
    }
    case "statement": {
      const s = await db.student.findUnique({ where: { id: p.student ?? "" } });
      const year = await db.schoolYear.findFirst({ where: p.year ? { id: p.year } : { active: true } });
      if (!s || !year) return null;
      const lines = await studentStatement(s.id, year.id);
      return {
        title: `Relevé de compte — ${s.lastName} ${s.firstName} (${s.code})`, subtitle: `Année ${year.label}`,
        columns: [{ header: "Date" }, { header: "Opération" }, { header: "Reçu" }, { header: "Débit (DT)", money: true }, { header: "Crédit (DT)", money: true }, { header: "Solde (DT)", money: true }],
        rows: lines.map((l) => [formatDate(l.date), l.label, l.ref, l.debit ? dt(l.debit) : null, l.credit ? dt(l.credit) : null, dt(l.balance)]),
      };
    }
    case "report": {
      const f = await reportFilters(p);
      const r = await financialReport(f);
      return {
        title: "Rapport financier", subtitle: `${f.label}${f.groupName ? ` — ${f.groupName}` : ""}${f.levelName ? ` — ${f.levelName}` : ""}`,
        columns: [{ header: "Mois" }, { header: "Facturé (DT)", money: true }, { header: "Encaissé (DT)", money: true }, { header: "Dépenses (DT)", money: true }, { header: "Rémunérations (DT)", money: true }, { header: "Résultat (DT)", money: true }, { header: "Impayés échus (DT)", money: true }],
        rows: [
          ...r.months.map((m) => [m.label, dt(m.billed), dt(m.cashed), dt(m.spent), dt(m.payroll), dt(m.result), dt(m.overdue)]),
          ["TOTAL", dt(r.total.billed), dt(r.total.cashed), dt(r.total.spent), dt(r.total.payroll), dt(r.total.result), dt(r.total.overdue)],
        ],
      };
    }
    case "group": {
      if (!p.id || !(await canAccessGroup(user, p.id))) return "forbidden";
      const g = await db.group.findUnique({
        where: { id: p.id },
        include: { teacher: true, schoolYear: true, enrollments: { where: { status: "ACTIVE" }, include: { student: { include: { guardians: { include: { guardian: true }, orderBy: { isPayer: "desc" }, take: 1 } } } }, orderBy: { student: { lastName: "asc" } } } },
      });
      if (!g) return null;
      return {
        title: `Liste du groupe ${g.name}`, subtitle: `${g.schoolYear.label}${g.teacher ? ` — ${g.teacher.lastName} ${g.teacher.firstName}` : ""}`,
        columns: [{ header: "N°" }, { header: "Matricule" }, { header: "Nom" }, { header: "Prénom" }, { header: "Téléphone parent" }, { header: "Entrée" }],
        rows: g.enrollments.map((e, i) => [i + 1, e.student.code, e.student.lastName, e.student.firstName, e.student.guardians[0]?.guardian.phone, formatDate(e.startDate)]),
      };
    }
    case "payroll": {
      const period = /^\d{4}-\d{2}$/.test(p.period ?? "") ? p.period! : todayISO().slice(0, 7);
      const list = await db.teacherPay.findMany({ where: { period }, include: { teacher: true, mode: true }, orderBy: { teacher: { lastName: "asc" } } });
      return {
        title: "Rémunérations des enseignants", subtitle: `Mois ${period}`,
        columns: [{ header: "Enseignant" }, { header: "Modalité" }, { header: "Calculé (DT)", money: true }, { header: "Ajustement (DT)", money: true }, { header: "Montant (DT)", money: true }, { header: "Statut" }, { header: "Payé le" }, { header: "Moyen" }],
        rows: list.map((x) => [`${x.teacher.lastName} ${x.teacher.firstName}`, x.payMode, dt(x.computedAmount), dt(x.adjustment), dt(x.amount), PAY_STATUS_LABEL[x.status], x.paidAt ? formatDate(x.paidAt) : "", x.mode?.label]),
      };
    }
  }
  return null;
}

/** CSV compatible Excel FR : séparateur « ; », BOM UTF-8, montants « 1234,500 », protection contre l'injection de formules. */
export function toCsv(t: Table): string {
  const cell = (v: Cell, money?: boolean) => {
    let s = v == null ? "" : money && typeof v === "number" ? v.toFixed(3).replace(".", ",") : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !(money && /^-?\d/.test(s))) s = `'${s}`;
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [[t.title], ...(t.subtitle ? [[t.subtitle]] : []), [], t.columns.map((c) => c.header)].map((r) => r.map((c) => cell(c)).join(";"));
  for (const r of t.rows) lines.push(r.map((v, i) => cell(v, t.columns[i]?.money)).join(";"));
  return "﻿" + lines.join("\r\n");
}

export async function toXlsx(t: Table, center: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = center;
  wb.created = new Date();
  const ws = wb.addWorksheet(t.title.slice(0, 31).replace(/[\\/?*[\]:]/g, "-"));
  ws.addRow([center]).font = { bold: true, size: 14, color: { argb: "FFC1272D" } };
  ws.addRow([t.title]).font = { bold: true, size: 12, color: { argb: "FF14213D" } };
  if (t.subtitle) ws.addRow([t.subtitle]);
  ws.addRow([`Édité le ${formatDateTime(new Date())} (heure de Tunis)`]).font = { italic: true, size: 9, color: { argb: "FF6B7280" } };
  ws.addRow([]);
  const header = ws.addRow(t.columns.map((c) => c.header));
  header.eachCell((c) => {
    c.font = { bold: true, color: { argb: "FFFFFFFF" } };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF14213D" } };
  });
  for (const r of t.rows) ws.addRow(r.map((v) => (v === undefined ? null : v)));
  t.columns.forEach((c, i) => {
    const col = ws.getColumn(i + 1);
    col.width = c.width ?? Math.min(40, Math.max(12, c.header.length + 2));
    if (c.money) col.numFmt = "#,##0.000";
  });
  ws.views = [{ state: "frozen", ySplit: header.number }];
  return Buffer.from(await wb.xlsx.writeBuffer());
}
