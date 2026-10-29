/**
 * Intégration : échéancier, encaissement, annulation et impayés sur une vraie base PostgreSQL de test.
 * Requiert TEST_DATABASE_URL (par défaut vamos_gestion_test en local) ; la base est remise à zéro.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";

const url = process.env.TEST_DATABASE_URL!;
process.env.DATABASE_URL = url;
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));

const { db } = await import("@/server/db");
const { resetTestDb, seedPaymentModes } = await import("./db-reset");
const finance = await import("@/server/services/finance");
const { defaultBillingMonths } = await import("@/lib/billing");

let studentId = "";
let enrollmentId = "";
let uid = "";

beforeAll(async () => {
  await resetTestDb(db, url);
  await seedPaymentModes(db);
  uid = (await db.user.create({ data: { email: "caisse@test.tn", fullName: "Caisse", role: "RESPONSABLE", passwordHash: "x" } })).id;
  const year = await db.schoolYear.create({
    data: { label: "2026-2027", startDate: new Date("2026-09-01"), endDate: new Date("2027-06-30"), billingMonths: defaultBillingMonths(2026), dueDay: 10, active: true },
  });
  const cycle = await db.cycle.create({ data: { name: "Collège", order: 1 } });
  const level = await db.level.create({ data: { cycleId: cycle.id, name: "9e année de base", order: 1 } });
  const subject = await db.subject.create({ data: { code: "MATH", name: "Mathématiques" } });
  const group = await db.group.create({ data: { name: "G1", schoolYearId: year.id, levelId: level.id, subjectId: subject.id, monthlyFee: 50000 } });
  const student = await db.student.create({ data: { code: "VA-2026-0001", firstName: "Test", lastName: "Élève" } });
  studentId = student.id;
  enrollmentId = (await db.enrollment.create({ data: { studentId, groupId: group.id, startDate: new Date("2026-10-15T12:00:00Z"), monthlyFee: 50000 } })).id;
}, 60_000);

describe("finances (intégration)", () => {
  it("génère l'échéancier à partir du mois d'entrée, de façon idempotente", async () => {
    expect(await finance.syncInvoicesForEnrollment(enrollmentId)).toBe(9); // octobre → juin
    expect(await finance.syncInvoicesForEnrollment(enrollmentId)).toBe(0);
  });

  it("encaisse en FIFO avec numéro de reçu séquentiel", async () => {
    const p1 = await finance.recordPayment({ studentId, amount: 75000, modeId: "mode_especes", reference: null, paidAt: "2026-10-20", note: null, invoiceIds: [] }, uid);
    const p2 = await finance.recordPayment({ studentId, amount: 25000, modeId: "mode_d17", reference: "TX1", paidAt: "2026-10-21", note: null, invoiceIds: [] }, uid);
    expect(p1.receiptNo).toBe("R-2026-000001");
    expect(p2.receiptNo).toBe("R-2026-000002");
    const inv = await finance.studentInvoices(studentId);
    expect(inv[0].period).toBe("2026-10");
    expect(inv[0].status).toBe("PAYEE");
    expect(inv[1].paid).toBe(50000);
    expect(inv[2].paid).toBe(0);
  });

  it("refuse un trop-perçu", async () => {
    await expect(finance.recordPayment({ studentId, amount: 999_000_000, modeId: "mode_especes", reference: null, paidAt: "2026-10-22", note: null, invoiceIds: [] }, uid)).rejects.toThrow(/dépasse/);
  });

  it("une annulation rend les échéances de nouveau dues et apparaît dans les impayés", async () => {
    const p = await db.payment.findFirstOrThrow({ where: { receiptNo: "R-2026-000002" } });
    await finance.cancelPayment(p.id, "Erreur de saisie", uid);
    const inv = await finance.studentInvoices(studentId);
    expect(inv[1].paid).toBe(25000);
    await expect(finance.cancelPayment(p.id, "x", uid)).rejects.toThrow(/déjà annulé/);
    const unpaid = await finance.unpaidSummary((await finance.getActiveYear()).id, new Date("2026-12-01"));
    expect(unpaid[0].due).toBe(25000); // reste de novembre (échu) ; décembre pas encore échu
    expect(await db.auditLog.count({ where: { action: "payment.cancel" } })).toBe(1);
  });
});
