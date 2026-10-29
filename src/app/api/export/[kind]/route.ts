import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/server/auth";
import { db } from "@/server/db";
import { audit } from "@/server/audit";
import { unpaidSummary } from "@/server/services/finance";
import { can, type Permission } from "@/lib/permissions";
import { formatDate, parseDay, todayISO } from "@/lib/format";
import { METHOD_LABEL } from "@/lib/labels";

const PERM: Record<string, Permission> = {
  students: "students.write", payments: "payments.read", unpaid: "payments.read", expenses: "expenses.read",
};

// CSV compatible Excel FR : séparateur « ; », BOM UTF-8, montants en DT avec virgule.
function csv(rows: (string | number | null | undefined)[][]) {
  const cell = (v: string | number | null | undefined) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@]/.test(s)) s = `'${s}`; // neutralise l'injection de formules
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}
const dt = (millimes: number) => (millimes / 1000).toFixed(3).replace(".", ",");

export async function GET(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const perm = PERM[kind];
  if (!perm) return NextResponse.json({ error: "Export inconnu" }, { status: 404 });
  if (!can(user.role, perm)) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  const sp = req.nextUrl.searchParams;
  let rows: (string | number | null | undefined)[][] = [];

  if (kind === "students") {
    const status = sp.get("status");
    const valid = ["PREINSCRIT", "ACTIF", "SUSPENDU", "ARCHIVE"].includes(status ?? "");
    const list = await db.student.findMany({
      where: valid ? { status: status as "ACTIF" } : { status: { not: "ARCHIVE" } },
      include: { level: true, guardians: { include: { guardian: true } } }, orderBy: { lastName: "asc" },
    });
    rows = [["Matricule", "Nom", "Prénom", "Nom arabe", "Naissance", "Niveau", "Classe", "Établissement", "Statut", "Parent", "Téléphone parent", "Démo"]];
    for (const s of list) {
      const g = s.guardians[0]?.guardian;
      rows.push([s.code, s.lastName, s.firstName, s.fullNameAr, s.birthDate ? formatDate(s.birthDate) : "", s.level?.name, s.className, s.school, s.status, g ? `${g.lastName} ${g.firstName}` : "", g?.phone, s.isDemo ? "oui" : ""]);
    }
  } else if (kind === "payments") {
    const from = sp.get("from") ?? `${todayISO().slice(0, 8)}01`;
    const to = sp.get("to") ?? todayISO();
    const list = await db.payment.findMany({
      where: { paidAt: { gte: parseDay(from), lte: new Date(parseDay(to).getTime() + 12 * 3600_000) } },
      include: { student: true }, orderBy: { paidAt: "asc" },
    });
    rows = [["Reçu", "Date", "Matricule", "Élève", "Mode", "Référence", "Montant (DT)", "Annulé"]];
    for (const p of list) rows.push([p.receiptNo, formatDate(p.paidAt), p.student.code, `${p.student.lastName} ${p.student.firstName}`, METHOD_LABEL[p.method], p.reference, dt(p.amount), p.cancelledAt ? "oui" : ""]);
  } else if (kind === "unpaid") {
    const year = await db.schoolYear.findFirst({ where: { active: true } });
    const list = year ? await unpaidSummary(year.id) : [];
    rows = [["Matricule", "Élève", "Parent", "Téléphone", "Échéances", "Depuis", "Montant dû (DT)"]];
    for (const u of list) {
      const g = u.student.guardians[0]?.guardian;
      rows.push([u.student.code, `${u.student.lastName} ${u.student.firstName}`, g ? `${g.lastName} ${g.firstName}` : "", g?.phone, u.count, formatDate(u.oldest), dt(u.due)]);
    }
  } else if (kind === "expenses") {
    const month = /^\d{4}-\d{2}$/.test(sp.get("month") ?? "") ? sp.get("month")! : todayISO().slice(0, 7);
    const [y, m] = month.split("-").map(Number);
    const list = await db.expense.findMany({
      where: { spentAt: { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) } },
      include: { category: true }, orderBy: { spentAt: "asc" },
    });
    rows = [["Date", "Catégorie", "Libellé", "Mode", "Montant (DT)"]];
    for (const e of list) rows.push([formatDate(e.spentAt), e.category.name, e.label, METHOD_LABEL[e.method], dt(e.amount)]);
  }

  await audit(user.id, "export", kind, null, Object.fromEntries(sp));
  return new NextResponse(csv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vamos-${kind}-${todayISO()}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
