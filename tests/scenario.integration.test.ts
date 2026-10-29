/**
 * Scénario métier complet (critères d'acceptation 1 à 8), exécuté via les vraies Server Actions avec une
 * session réelle pour chaque rôle, sur une base PostgreSQL de test.
 */
import { createHash, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { Role } from "@prisma/client";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
const jar = new Map<string, string>();
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined),
    set: (k: string, v: string) => jar.set(k, v),
    delete: (k: string) => jar.delete(k),
  }),
}));

const { db } = await import("@/server/db");
const { resetTestDb, seedPaymentModes } = await import("./db-reset");
const students = await import("@/app/(app)/students/actions");
const academics = await import("@/app/(app)/academics/actions");
const attendance = await import("@/app/(app)/attendance/actions");
const payments = await import("@/app/(app)/payments/actions");
const expenses = await import("@/app/(app)/expenses/actions");
const payroll = await import("@/app/(app)/payroll/actions");
const messages = await import("@/app/(app)/messages/actions");
const finance = await import("@/server/services/finance");
const reports = await import("@/server/services/reports");
const { syncAlerts } = await import("@/server/services/notifications");
const { buildTable, toCsv } = await import("@/server/exports");
const { receiptPdf } = await import("@/server/pdf");
const { GET: receiptRoute } = await import("@/app/api/receipts/[id]/pdf/route");
const { defaultBillingMonths } = await import("@/lib/billing");
const { DEFAULT_TEMPLATES } = await import("@/lib/templates");

const fd = (o: Record<string, string | string[] | undefined>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of [v ?? ""].flat()) f.append(k, x);
  return f;
};
const users: Partial<Record<Role, { id: string; role: Role; teacherId: string | null; email: string; fullName: string; mustChangePassword: boolean }>> = {};
async function loginAs(role: Role, teacherId?: string) {
  const user = users[role] ?? (users[role] = await db.user.create({ data: { email: `${role.toLowerCase()}@scenario.tn`, fullName: `Test ${role}`, role, passwordHash: "x", teacherId } }));
  const token = randomBytes(32).toString("base64url");
  await db.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  jar.set("vamos_session", token);
  return user;
}
const ids: Record<string, string> = {};

beforeAll(async () => {
  await resetTestDb(db, process.env.TEST_DATABASE_URL!);
  await seedPaymentModes(db);
  for (const t of DEFAULT_TEMPLATES) await db.messageTemplate.create({ data: t });
  await db.centerSettings.create({ data: { id: 1 } });
  const year = await db.schoolYear.create({
    data: { label: "2026-2027", startDate: new Date("2026-09-01T12:00:00Z"), endDate: new Date("2027-06-30T12:00:00Z"), billingMonths: defaultBillingMonths(2026), dueDay: 10, active: true },
  });
  const cycle = await db.cycle.create({ data: { name: "Collège", order: 1 } });
  const level = await db.level.create({ data: { cycleId: cycle.id, name: "9e année de base", order: 1 } });
  const math = await db.subject.create({ data: { code: "MATH", name: "Mathématiques" } });
  const room = await db.room.create({ data: { name: "Salle 1", capacity: 15 } });
  const teacher = await db.teacher.create({ data: { firstName: "Karim", lastName: "Prof", phone: "22 111 111", payMode: "HORAIRE", payRate: 15000, subjects: { create: { subjectId: math.id } } } });
  await db.feeRule.create({ data: { schoolYearId: year.id, cycleId: cycle.id, monthlyFee: 45000, registrationFee: 10000 } });
  await db.expenseCategory.create({ data: { name: "Fournitures" } });
  Object.assign(ids, { year: year.id, cycle: cycle.id, level: level.id, math: math.id, room: room.id, teacher: teacher.id });
}, 60_000);

describe("Scénario métier VAMOS ACADEMY", () => {
  it("1. inscrit un élève (dossier + parent) et notifie l'administration", async () => {
    await loginAs("RESPONSABLE");
    const res = await students.createStudent(null, fd({ firstName: "Amine", lastName: "Ben Salah", birthDate: "2012-05-04", levelId: ids.level, parent_lastName: "Ben Salah", parent_firstName: "Sami", parent_phone: "98111222", parent_relation: "Père" }));
    expect(res?.ok).toBe(true);
    const s = await db.student.findFirstOrThrow();
    expect(s.code).toBe("VA-2026-0001");
    ids.student = s.id;
    expect(await db.notification.count({ where: { type: "NOUVEL_INSCRIT" } })).toBe(1);
  });

  it("2. crée le groupe au tarif de la grille, affecte l'enseignant et inscrit l'élève", async () => {
    const g = await academics.createGroup(null, fd({ name: "Maths 9e — G1", levelId: ids.level, subjectId: ids.math, teacherId: ids.teacher, roomId: ids.room, capacity: "12", monthlyFee: "", registrationFee: "" }));
    expect(g?.ok).toBe(true);
    const group = await db.group.findFirstOrThrow();
    expect(group.monthlyFee).toBe(45000); // grille tarifaire (cycle Collège)
    expect(group.registrationFee).toBe(10000);
    expect(group.teacherId).toBe(ids.teacher);
    ids.group = group.id;
    expect((await academics.saveSlot(null, fd({ groupId: group.id, roomId: ids.room, weekday: "3", start: "14:00", end: "16:00" })))?.ok).toBe(true);
    const e = await students.enrollStudent(ids.student, null, fd({ groupId: group.id, startDate: "2026-10-01", plan: "MENSUEL" }));
    expect(e?.ok).toBe(true);
    const inv = await db.invoice.findMany({ where: { cancelledAt: null }, orderBy: { dueDate: "asc" } });
    expect(inv).toHaveLength(9); // octobre → juin
    expect(inv.every((i) => i.amount === 45000)).toBe(true);
  });

  it("3. l'enseignant enregistre la présence ; l'absence non justifiée génère une alerte, résolue par le justificatif", async () => {
    await loginAs("ENSEIGNANT", ids.teacher);
    expect((await attendance.saveAttendance(ids.group, "2026-10-14", null, fd({ [`s_${ids.student}`]: "ABSENT" })))?.ok).toBe(true);
    expect(await db.notification.count({ where: { type: "ABSENCE" } })).toBe(1);
    await syncAlerts(true);
    expect(await db.notification.count({ where: { type: "JUSTIFICATIF", status: "NOUVELLE" } })).toBe(1);
    await attendance.saveAttendance(ids.group, "2026-10-14", null, fd({ [`s_${ids.student}`]: "EXCUSE", [`n_${ids.student}`]: "Certificat médical" }));
    expect(await db.notification.count({ where: { type: "JUSTIFICATIF", status: "TRAITEE" } })).toBe(1);
    expect((await attendance.saveAttendance(ids.group, "2026-10-21", null, fd({ [`s_${ids.student}`]: "PRESENT" })))?.ok).toBe(true);
  });

  it("4. le comptable enregistre un paiement partiel", async () => {
    await loginAs("COMPTABLE");
    const res = await payments.createPayment(null, fd({ studentId: ids.student, amount: "30", modeId: "mode_especes", paidAt: "2026-10-20" }));
    expect(res?.ok).toBe(true);
    const p = await db.payment.findFirstOrThrow({ include: { allocations: true } });
    expect(p.receiptNo).toBe("R-2026-000001");
    expect(p.amount).toBe(30000);
    expect(p.allocations).toHaveLength(1);
    ids.payment = p.id;
    expect((await payments.createPayment(null, fd({ studentId: ids.student, amount: "10", modeId: "mode_cheque", paidAt: "2026-10-20" })))?.error).toMatch(/référence est obligatoire/);
    expect((await payments.createPayment(null, fd({ studentId: ids.student, amount: "10,5,5", modeId: "mode_especes", paidAt: "2026-10-20" })))?.error).toMatch(/corriger/);
  });

  it("5. calcule le solde restant et génère le reçu (PDF)", async () => {
    const b = (await finance.studentBalances([ids.student], ids.year)).get(ids.student)!;
    expect(b).toMatchObject({ billed: 405000, paid: 30000, remaining: 375000 });
    const inv = await finance.studentInvoices(ids.student, ids.year);
    expect(inv[0]).toMatchObject({ paid: 30000, remaining: 15000 });
    const statement = await finance.studentStatement(ids.student, ids.year);
    expect(statement.at(-1)?.balance).toBe(375000);
    const pdf = await receiptPdf(ids.payment);
    expect(Buffer.from(pdf).subarray(0, 4).toString()).toBe("%PDF");
    const res = await receiptRoute(new Request("http://x"), { params: Promise.resolve({ id: ids.payment }) });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
  });

  it("6. consulte les statistiques financières (rapport mensuel, exports)", async () => {
    await expenses.createExpense(null, fd({ categoryId: (await db.expenseCategory.findFirstOrThrow()).id, label: "Marqueurs", amount: "100", modeId: "mode_especes", spentAt: "2026-10-15" }));
    const r = await reports.financialReport(await reports.reportFilters({ month: "2026-10" }));
    expect(r.total).toMatchObject({ billed: 45000, cashed: 30000, spent: 100000, payroll: 0, result: -70000 });
    const user = users.COMPTABLE!;
    const table = await buildTable("report", { month: "2026-10" }, user);
    expect(table).not.toBe("forbidden");
    const csv = toCsv(table as Exclude<typeof table, "forbidden" | null>);
    expect(csv).toContain("TOTAL;45,000;30,000;100,000;0,000;-70,000");
  });

  it("7. corrige un paiement et une dépense en conservant la traçabilité", async () => {
    const res = await payments.correctPayment(ids.payment, null, fd({ amount: "35", modeId: "mode_especes", paidAt: "2026-10-20", reason: "Montant mal saisi" }));
    expect(res?.ok).toBe(true);
    const orig = await db.payment.findUniqueOrThrow({ where: { id: ids.payment }, include: { correctedBy: true } });
    expect(orig.cancelledAt).not.toBeNull();
    expect(orig.cancelReason).toMatch(/Corrigé par R-2026-000002 : Montant mal saisi/);
    expect(orig.correctedBy?.amount).toBe(35000);
    expect(await db.payment.count()).toBe(2); // rien n'est supprimé
    expect((await finance.studentBalances([ids.student], ids.year)).get(ids.student)!.paid).toBe(35000);
    expect(await db.auditLog.count({ where: { action: "payment.correct" } })).toBe(1);

    const exp = await db.expense.findFirstOrThrow();
    expect((await expenses.correctExpense(exp.id, null, fd({ categoryId: exp.categoryId, label: "Marqueurs", amount: "120", modeId: "mode_especes", spentAt: "2026-10-15", reason: "Facture réelle" })))?.ok).toBe(true);
    expect(await db.expense.count()).toBe(2);
    const r = await reports.financialReport(await reports.reportFilters({ month: "2026-10" }));
    expect(r.total.spent).toBe(120000); // seule la dépense corrigée compte

    // Changement de tarif à partir de novembre : échéances futures annulées puis recréées, octobre (payé) conservé
    await loginAs("RESPONSABLE");
    const e = await db.enrollment.findFirstOrThrow();
    expect((await students.changeTerms(e.id, null, fd({ monthlyFee: "40", plan: "TRIMESTRIEL", fromPeriod: "2026-11", reason: "Accord direction" })))?.ok).toBe(true);
    const live = await db.invoice.findMany({ where: { enrollmentId: e.id, cancelledAt: null }, orderBy: { period: "asc" } });
    expect(live.map((i) => [i.period, i.months, i.amount])).toEqual([["2026-10", 1, 45000], ["2026-11", 3, 120000], ["2027-02", 3, 120000], ["2027-05", 2, 80000]]);
    expect(await db.invoice.count({ where: { enrollmentId: e.id, cancelledAt: { not: null } } })).toBe(8);
  });

  it("calcule, valide, paie puis annule une rémunération (dépense liée tracée)", async () => {
    await loginAs("COMPTABLE");
    expect((await payroll.computeAll("2026-10"))?.ok).toBe(true);
    const pay = await db.teacherPay.findFirstOrThrow();
    expect(pay).toMatchObject({ payMode: "HORAIRE", quantity: 240, computedAmount: 60000 }); // 2 séances × 2 h = 4 h × 15 DT
    expect((await payroll.validate(pay.id, null, fd({ adjustment: "5" })))?.error).toMatch(/Justifiez/);
    expect((await payroll.validate(pay.id, null, fd({ adjustment: "5", note: "Prime" })))?.ok).toBe(true);
    expect((await payroll.pay(pay.id, null, fd({ modeId: "mode_especes", paidAt: "2026-10-28" })))?.ok).toBe(true);
    const exp = await db.expense.findFirstOrThrow({ where: { teacherPayId: pay.id } });
    expect(exp.amount).toBe(65000); // 60 DT + prime de 5 DT
    expect((await payroll.cancelPayroll(pay.id, fd({ reason: "Erreur de mois" })))?.ok).toBe(true);
    expect((await db.expense.findUniqueOrThrow({ where: { id: exp.id } })).cancelledAt).not.toBeNull();
  });

  it("prépare des rappels de paiement en français, sans envoi automatique", async () => {
    const tpl = await db.messageTemplate.findUniqueOrThrow({ where: { code: "RAPPEL_PAIEMENT" } });
    const res = await messages.prepareMessages(null, fd({ templateId: tpl.id, ids: ids.student, keys: `s:${ids.student}:${(await db.guardian.findFirstOrThrow()).id}` }));
    expect(res?.ok).toBe(true);
    const m = await db.message.findFirstOrThrow();
    expect(m).toMatchObject({ status: "PREPARE", channel: "MANUEL", recipientPhone: "98 111 222" });
    expect(m.body).toMatch(/^Bonjour Sami Ben Salah, VAMOS ACADEMY vous rappelle qu'un montant de .+ reste dû pour Amine Ben Salah/);
    await messages.markSent(fd({ ids: m.id }));
    expect((await db.message.findUniqueOrThrow({ where: { id: m.id } })).status).toBe("ENVOYE");
  });

  it("8. les rôles non autorisés ne peuvent ni consulter ni modifier les finances", async () => {
    for (const role of ["ENSEIGNANT", "LECTURE"] as const) {
      await loginAs(role, role === "ENSEIGNANT" ? ids.teacher : undefined);
      const u = users[role]!;
      expect((await payments.createPayment(null, fd({ studentId: ids.student, amount: "5", modeId: "mode_especes", paidAt: "2026-10-20" })))?.error).toMatch(/Accès refusé/);
      expect((await payments.cancelPayment(ids.payment, fd({ reason: "x" })))?.error).toMatch(/Accès refusé/);
      expect((await payments.correctPayment(ids.payment, null, fd({ amount: "1", modeId: "mode_especes", paidAt: "2026-10-20", reason: "x" })))?.error).toMatch(/Accès refusé/);
      expect((await expenses.createExpense(null, fd({ categoryId: "x", label: "x", amount: "1", modeId: "mode_especes", spentAt: "2026-10-20" })))?.error).toMatch(/Accès refusé/);
      expect((await payroll.computeAll("2026-10"))?.error).toMatch(/Accès refusé/);
      expect((await messages.prepareMessages(null, fd({})))?.error).toMatch(/Accès refusé/);
      for (const kind of ["payments", "unpaid", "expenses", "report", "statement", "payroll"]) expect(await buildTable(kind, { student: ids.student }, u)).toBe("forbidden");
      const pdf = await receiptRoute(new Request("http://x"), { params: Promise.resolve({ id: ids.payment }) });
      expect(pdf.status).toBe(403);
    }
    expect(await buildTable("report", {}, users.RESPONSABLE!)).toBe("forbidden"); // rapports : comptable / admin
    expect(await db.payment.count()).toBe(2); // aucune écriture n'a abouti
  });
});
