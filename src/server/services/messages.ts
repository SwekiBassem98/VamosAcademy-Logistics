import "server-only";
import type { MessageAudience } from "@prisma/client";
import { db } from "../db";
import { studentBalances, unpaidSummary } from "./finance";
import { renderTemplate } from "@/lib/templates";
import { formatDate, formatMoney, parseDay } from "@/lib/format";

export type Recipient = {
  key: string; name: string; phone: string | null; studentId?: string; guardianId?: string; teacherId?: string;
  context: string; body: string;
};
export type Target = { kind: "unpaid" } | { kind: "students"; ids: string[] } | { kind: "group"; id: string } | { kind: "absent"; date: string } | { kind: "teachers" };

export function parseTarget(raw: string | undefined, ids?: string): Target | null {
  if (ids) return { kind: "students", ids: ids.split(",").filter(Boolean).slice(0, 500) };
  if (!raw) return null;
  if (raw === "unpaid") return { kind: "unpaid" };
  if (raw === "teachers") return { kind: "teachers" };
  const [k, v] = raw.split(":");
  if (k === "group" && v) return { kind: "group", id: v };
  if (k === "absent" && /^\d{4}-\d{2}-\d{2}$/.test(v ?? "")) return { kind: "absent", date: v };
  return null;
}

/**
 * Construit les destinataires et le texte de chaque message à partir des données (jamais du navigateur).
 * Parents : le contact « responsable des paiements » en priorité, sinon le premier contact.
 */
export async function buildRecipients(templateBody: string, audience: MessageAudience, target: Target, extra = ""): Promise<{ recipients: Recipient[]; skipped: string[] }> {
  const center = await db.centerSettings.findUnique({ where: { id: 1 } });
  const base = { centre: center?.name ?? "VAMOS ACADEMY", telephone: center?.phone ?? "" };
  const year = await db.schoolYear.findFirst({ where: { active: true } });
  const skipped: string[] = [];
  const out: Recipient[] = [];
  const body = (vars: Record<string, string | null | undefined>) => (renderTemplate(templateBody, { ...base, ...vars }) + (extra ? ` ${extra}` : "")).trim();

  if (audience === "ENSEIGNANT") {
    const teachers = await db.teacher.findMany({
      where: target.kind === "group" ? { groups: { some: { id: target.id } } } : { active: true },
      include: { groups: { where: { active: true, schoolYear: { active: true } }, select: { name: true } } },
      orderBy: { lastName: "asc" },
    });
    for (const t of teachers) {
      out.push({ key: `t:${t.id}`, name: `${t.firstName} ${t.lastName}`, phone: t.phone, teacherId: t.id, context: t.groups.map((g) => g.name).join(", "),
        body: body({ enseignant: `${t.firstName} ${t.lastName}`, groupe: t.groups.map((g) => g.name).join(", ") }) });
    }
    return { recipients: out, skipped };
  }

  type S = { id: string; firstName: string; lastName: string; guardians: { guardian: { id: string; firstName: string; lastName: string; phone: string } }[] };
  const include = { guardians: { include: { guardian: true }, orderBy: { isPayer: "desc" as const } }, enrollments: { where: { status: "ACTIVE" as const }, include: { group: { select: { name: true } } } } };
  let students: (S & { enrollments: { group: { name: string } }[] })[] = [];
  const extraVars = new Map<string, Record<string, string>>();

  if (target.kind === "unpaid" && year) {
    const rows = await unpaidSummary(year.id);
    students = await db.student.findMany({ where: { id: { in: rows.map((r) => r.student.id) } }, include });
    for (const r of rows) extraVars.set(r.student.id, { montant: formatMoney(r.due), echeance: formatDate(r.oldest), groupe: [...r.groups].join(", ") });
  } else if (target.kind === "students") {
    students = await db.student.findMany({ where: { id: { in: target.ids }, status: { not: "ARCHIVE" } }, include });
    if (year) {
      const balances = await studentBalances(students.map((s) => s.id), year.id);
      for (const s of students) {
        const b = balances.get(s.id);
        const next = await db.invoice.findFirst({
          where: { cancelledAt: null, enrollment: { studentId: s.id, group: { schoolYearId: year.id } }, allocations: { none: { payment: { cancelledAt: null } } } },
          orderBy: { dueDate: "asc" },
        });
        extraVars.set(s.id, { montant: b ? formatMoney(b.overdue || b.remaining) : "", echeance: next ? formatDate(next.dueDate) : "" });
      }
    }
  } else if (target.kind === "group") {
    students = await db.student.findMany({ where: { enrollments: { some: { groupId: target.id, status: "ACTIVE" } } }, include });
  } else if (target.kind === "absent") {
    const recs = await db.attendanceRecord.findMany({ where: { status: "ABSENT", session: { date: parseDay(target.date) } }, include: { session: { include: { group: true } } } });
    students = await db.student.findMany({ where: { id: { in: recs.map((r) => r.studentId) } }, include });
    for (const r of recs) extraVars.set(r.studentId, { date: formatDate(r.session.date), groupe: r.session.group.name });
  }

  for (const s of students.sort((a, b) => a.lastName.localeCompare(b.lastName, "fr"))) {
    const g = s.guardians[0]?.guardian;
    if (!g) { skipped.push(`${s.lastName} ${s.firstName} (aucun parent enregistré)`); continue; }
    const v = extraVars.get(s.id) ?? {};
    out.push({
      key: `s:${s.id}:${g.id}`, name: `${g.firstName} ${g.lastName}`, phone: g.phone, studentId: s.id, guardianId: g.id,
      context: `${s.lastName} ${s.firstName}`,
      body: body({ parent: `${g.firstName} ${g.lastName}`, eleve: `${s.firstName} ${s.lastName}`, groupe: v.groupe ?? s.enrollments.map((e) => e.group.name).join(", "), ...v }),
    });
  }
  return { recipients: out, skipped };
}
