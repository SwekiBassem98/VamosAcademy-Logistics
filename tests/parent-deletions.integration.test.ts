/** Portail parent (isolation), suppressions, reçus de rémunération, tarifs et remise à zéro de la base. */
import { createHash, randomBytes } from "node:crypto";
import { execSync, spawnSync } from "node:child_process";
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
  headers: async () => ({ get: () => "10.0.0.9" }),
}));

const { db } = await import("@/server/db");
const { resetTestDb, seedPaymentModes } = await import("./db-reset");
const { defaultBillingMonths } = await import("@/lib/billing");
const { studentScope, childrenOf } = await import("@/server/scope");
const auth = await import("@/server/auth");
const { recordPayment } = await import("@/server/services/finance");
const { draftPay, validatePay, markPayPaid } = await import("@/server/services/payroll");
const students = await import("@/app/(app)/students/actions");
const teachers = await import("@/app/(app)/teachers/actions");
const users = await import("@/app/(app)/users/actions");
const tarifs = await import("@/app/(app)/tarifs/actions");
const { loginAction } = await import("@/app/login/actions");
const { GET: receiptRoute } = await import("@/app/api/receipts/[id]/pdf/route");
const { GET: payRoute } = await import("@/app/api/payroll/[id]/pdf/route");

const fd = (o: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) f.append(k, v);
  return f;
};
const ids: Record<string, string> = {};

async function sessionFor(userId: string) {
  const token = randomBytes(32).toString("base64url");
  await db.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  jar.set("vamos_session", token);
}
async function loginAs(role: Role, extra: { guardianId?: string; teacherId?: string } = {}) {
  const user = await db.user.create({ data: { email: `${role}-${randomBytes(3).toString("hex")}@test.tn`, fullName: `Test ${role}`, role, passwordHash: "x", ...extra } });
  await sessionFor(user.id);
  return user;
}
const receipt = (id: string) => receiptRoute(new Request("http://x"), { params: Promise.resolve({ id }) });

async function family(code: string, phone: string, guardianId?: string) {
  const g = guardianId ?? (await db.guardian.create({ data: { firstName: "Parent", lastName: code, phone } })).id;
  const s = await db.student.create({ data: { code, firstName: "Enfant", lastName: code, status: "ACTIF", guardians: { create: { guardianId: g, relation: "Père", isPayer: true } } } });
  const e = await db.enrollment.create({ data: { studentId: s.id, groupId: ids.group, startDate: new Date("2026-09-15T12:00:00Z"), baseFee: 50000, monthlyFee: 50000 } });
  const inv = await db.invoice.create({ data: { enrollmentId: e.id, period: "2026-09", amount: 50000, dueDate: new Date("2026-09-20T12:00:00Z") } });
  return { guardianId: g, studentId: s.id, enrollmentId: e.id, invoiceId: inv.id };
}

beforeAll(async () => {
  await resetTestDb(db, process.env.TEST_DATABASE_URL!);
  await seedPaymentModes(db);
  const year = await db.schoolYear.create({
    data: { label: "2026-2027", startDate: new Date("2026-09-01T12:00:00Z"), endDate: new Date("2027-06-30T12:00:00Z"), billingMonths: defaultBillingMonths(2026), dueDay: 10, active: true },
  });
  const cycle = await db.cycle.create({ data: { name: "Collège", order: 1 } });
  const level = await db.level.create({ data: { cycleId: cycle.id, name: "9e", order: 1 } });
  const subject = await db.subject.create({ data: { code: "MATH", name: "Maths" } });
  const teacher = await db.teacher.create({ data: { firstName: "Prof", lastName: "Maths", phone: "22 111 111", payMode: "MENSUEL", payRate: 300000 } });
  const group = await db.group.create({ data: { name: "Maths G1", schoolYearId: year.id, levelId: level.id, subjectId: subject.id, teacherId: teacher.id, capacity: 20, monthlyFee: 50000 } });
  Object.assign(ids, { year: year.id, level: level.id, cycle: cycle.id, subject: subject.id, teacher: teacher.id, group: group.id });
  ids.admin = (await db.user.create({ data: { email: "admin@test.tn", fullName: "Admin", role: "ADMIN", passwordHash: "x" } })).id;
}, 60_000);

describe("portail parent : isolation", () => {
  it("un parent ne voit que ses enfants, ses reçus et jamais ceux d'une autre famille", async () => {
    const a = await family("A-1", "90 000 001");
    const sibling = await family("A-2", "90 000 001", a.guardianId);
    const b = await family("B-1", "90 000 002");
    const pa = await recordPayment({ studentId: a.studentId, amount: 50000, modeId: "mode_especes", reference: null, paidAt: "2026-10-01", note: null, invoiceIds: [] }, ids.admin);
    const pb = await recordPayment({ studentId: b.studentId, amount: 50000, modeId: "mode_especes", reference: null, paidAt: "2026-10-01", note: null, invoiceIds: [] }, ids.admin);

    await loginAs("PARENT", { guardianId: a.guardianId });
    const me = (await auth.getCurrentUser())!;
    const visible = await db.student.findMany({ where: studentScope(me), select: { id: true } });
    expect(visible.map((s) => s.id).sort()).toEqual([a.studentId, sibling.studentId].sort());
    expect((await receipt(pa.id)).status).toBe(200);
    expect((await receipt(pb.id)).status).toBe(403);

    await db.payment.update({ where: { id: pa.id }, data: { cancelledAt: new Date(), cancelReason: "test" } });
    expect((await receipt(pa.id)).status).toBe(403); // un reçu annulé n'est pas remis au parent
  });

  it("un compte parent sans parent associé ne voit aucun élève", async () => {
    await loginAs("PARENT");
    const me = (await auth.getCurrentUser())!;
    expect(await db.student.count({ where: childrenOf(me) })).toBe(0);
  });

  it("un parent n'a accès à aucune action du personnel", async () => {
    const g = await db.guardian.create({ data: { firstName: "P", lastName: "Isolé", phone: "90 000 009" } });
    await loginAs("PARENT", { guardianId: g.id });
    expect((await students.createStudent(null, fd({ firstName: "X", lastName: "Y" })))?.error).toMatch(/Accès refusé/);
    expect((await students.removeStudent("x", fd({ reason: "essai" })))?.error).toMatch(/Accès refusé/);
    expect((await users.deleteUser("x"))?.error).toMatch(/Accès refusé/);
  });

  it("le compte parent doit être relié à un parent, et un seul compte par parent", async () => {
    const g = await db.guardian.create({ data: { firstName: "P", lastName: "Unique", phone: "90 000 010" } });
    await loginAs("ADMIN");
    const base = { fullName: "Parent Unique", role: "PARENT", password: "MotDePasse2026" };
    expect((await users.saveUser(null, null, fd({ ...base, email: "p1@test.tn" })))?.error).toMatch(/Associez/);
    expect((await users.saveUser(null, null, fd({ ...base, email: "p2@test.tn", guardianId: g.id })))?.ok).toBe(true);
    expect((await users.saveUser(null, null, fd({ ...base, email: "p3@test.tn", guardianId: g.id })))?.error).toMatch(/déjà un compte/);
    expect((await db.user.findUniqueOrThrow({ where: { email: "p2@test.tn" } })).mustChangePassword).toBe(true);
  });
});

describe("connexion", () => {
  it("demande un chargement complet du tableau de bord au lieu d'une redirection serveur", async () => {
    await db.user.create({ data: { email: "login@test.tn", fullName: "Login", role: "ADMIN", passwordHash: await auth.hashPassword("MotDePasse2026") } });
    const res = await loginAction(null, fd({ email: "login@test.tn", password: "MotDePasse2026" }));
    expect(res?.ok).toBe(true);
    expect(res?.redirectTo).toBe("/dashboard");
    const bad = await loginAction(null, fd({ email: "login@test.tn", password: "mauvais" }));
    expect(bad?.redirectTo).toBeUndefined();
  });
});

describe("reçu de rémunération", () => {
  it("attribue un numéro au paiement et fournit un PDF, réservé aux finances", async () => {
    const pay = await draftPay(ids.teacher, "2026-10", ids.admin);
    expect(pay.receiptNo).toBeNull();
    await validatePay(pay.id, 0, null, ids.admin);
    const no = await markPayPaid(pay.id, { modeId: "mode_especes", paidAt: "2026-10-31", reference: null }, ids.admin);
    expect(no).toBe("P-2026-000001");
    expect((await db.teacherPay.findUniqueOrThrow({ where: { id: pay.id } })).receiptNo).toBe(no);
    await expect(markPayPaid(pay.id, { modeId: "mode_especes", paidAt: "2026-10-31", reference: null }, ids.admin)).rejects.toThrow(/validée/);

    await loginAs("ADMIN");
    const ok = await payRoute(new Request("http://x"), { params: Promise.resolve({ id: pay.id }) });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("Content-Type")).toBe("application/pdf");
    await loginAs("PARENT");
    expect((await payRoute(new Request("http://x"), { params: Promise.resolve({ id: pay.id }) })).status).toBe(403);
    ids.pay = pay.id;
  });
});

describe("tarifs et réductions", () => {
  it("la réduction choisie recalcule la mensualité depuis le tarif de base et les échéances non payées", async () => {
    const f = await family("T-1", "90 000 020");
    const discount = await db.discountType.create({ data: { name: "Fratrie", percent: 10 } });
    await loginAs("ADMIN");
    const res = await students.changeTerms(f.enrollmentId, null, fd({ discountTypeId: discount.id, monthlyFee: "1", plan: "MENSUEL", fromPeriod: "2026-11", reason: "frère inscrit" }));
    expect(res?.ok).toBe(true);
    const e = await db.enrollment.findUniqueOrThrow({ where: { id: f.enrollmentId } });
    expect(e).toMatchObject({ monthlyFee: 45000, baseFee: 50000, discountPercent: 10, discountTypeId: discount.id });
    const nov = await db.invoice.findFirstOrThrow({ where: { enrollmentId: f.enrollmentId, period: "2026-11", cancelledAt: null } });
    expect(nov.amount).toBe(45000);

    const off = await students.changeTerms(f.enrollmentId, null, fd({ discountTypeId: "", monthlyFee: "50,000", plan: "MENSUEL", fromPeriod: "2026-11", reason: "fin de la réduction" }));
    expect(off?.ok).toBe(true);
    expect(await db.enrollment.findUniqueOrThrow({ where: { id: f.enrollmentId } })).toMatchObject({ monthlyFee: 50000, discountPercent: 0, discountTypeId: null });
  });

  it("aligner un groupe sur la grille ne touche pas aux inscriptions existantes", async () => {
    const before = await db.enrollment.findMany({ where: { groupId: ids.group }, select: { id: true, monthlyFee: true }, orderBy: { id: "asc" } });
    await db.feeRule.create({ data: { schoolYearId: ids.year, levelId: ids.level, subjectId: ids.subject, monthlyFee: 70000, registrationFee: 5000 } });
    await loginAs("COMPTABLE");
    expect((await tarifs.applyGridToGroup(ids.group))?.error).toMatch(/Accès refusé/);
    await loginAs("ADMIN");
    expect((await tarifs.applyGridToGroup(ids.group))?.ok).toBe(true);
    expect(await db.group.findUniqueOrThrow({ where: { id: ids.group } })).toMatchObject({ monthlyFee: 70000, registrationFee: 5000 });
    expect(await db.enrollment.findMany({ where: { groupId: ids.group }, select: { id: true, monthlyFee: true }, orderBy: { id: "asc" } })).toEqual(before);
    expect((await tarifs.applyGridToGroup(ids.group))?.error).toMatch(/déjà conforme/);
  });
});

describe("suppressions par l'administrateur", () => {
  it("seul l'administrateur peut supprimer ; il ne peut supprimer ni lui-même ni le dernier admin actif", async () => {
    const victim = await db.user.create({ data: { email: "victime@test.tn", fullName: "Victime", role: "COMPTABLE", passwordHash: "x" } });
    await db.session.create({ data: { userId: victim.id, tokenHash: "victime", expiresAt: new Date(Date.now() + 3600_000) } });
    await loginAs("RESPONSABLE");
    expect((await users.deleteUser(victim.id))?.error).toMatch(/Accès refusé/);
    expect((await students.removeStudent("x", fd({ reason: "essai" })))?.error).toMatch(/Accès refusé/);
    expect((await teachers.removeTeacher("x", fd({ reason: "essai" })))?.error).toMatch(/Accès refusé/);

    const me = await loginAs("ADMIN");
    expect((await users.deleteUser(me.id))?.error).toMatch(/propre compte/);
    expect((await users.deleteUser(victim.id))?.ok).toBe(true);
    expect(await db.user.count({ where: { id: victim.id } })).toBe(0);
    expect(await db.session.count({ where: { userId: victim.id } })).toBe(0);
    expect(await db.auditLog.count({ where: { action: "user.delete", entityId: victim.id } })).toBe(1);

    await db.user.updateMany({ where: { role: "ADMIN", NOT: { id: me.id } }, data: { active: false } });
    const other = await db.user.create({ data: { email: "admin-inactif@test.tn", fullName: "Inactif", role: "ADMIN", active: false, passwordHash: "x" } });
    expect((await users.deleteUser(other.id))?.ok).toBe(true); // un admin inactif n'est pas le dernier actif
    await db.user.updateMany({ where: { role: "ADMIN" }, data: { active: true } });
  });

  it("supprimer un élève efface tout son dossier, garde les frères et sœurs, et ne réutilise pas son numéro de reçu", async () => {
    const a = await family("D-1", "90 000 030");
    const sibling = await family("D-2", "90 000 030", a.guardianId);
    const single = await family("D-3", "90 000 031");
    const parent = await db.user.create({ data: { email: "parent-d3@test.tn", fullName: "Parent", role: "PARENT", guardianId: single.guardianId, passwordHash: "x" } });
    const p = await recordPayment({ studentId: a.studentId, amount: 10000, modeId: "mode_especes", reference: null, paidAt: "2026-10-01", note: null, invoiceIds: [] }, ids.admin);
    const session = await db.attendanceSession.create({ data: { groupId: ids.group, date: new Date("2026-10-02T00:00:00Z"), records: { create: { studentId: a.studentId, status: "ABSENT" } } } });
    const assess = await db.assessment.create({ data: { groupId: ids.group, title: "Devoir", kind: "DEVOIR", term: 1, date: new Date("2026-10-03T12:00:00Z"), grades: { create: { studentId: a.studentId, score: 12 } } } });
    await db.notification.create({ data: { type: "NOUVEL_INSCRIT", title: "x", permission: "students.read", href: `/students/${a.studentId}` } });

    await loginAs("ADMIN");
    expect((await students.removeStudent(a.studentId, fd({ reason: "" })))?.error).toMatch(/motif/i);
    expect(await db.student.count({ where: { id: a.studentId } })).toBe(1);

    expect((await students.removeStudent(a.studentId, fd({ reason: "doublon de dossier" })))?.ok).toBe(true);
    expect(await db.student.count({ where: { id: a.studentId } })).toBe(0);
    expect(await db.payment.count({ where: { id: p.id } })).toBe(0);
    expect(await db.invoice.count({ where: { id: a.invoiceId } })).toBe(0);
    expect(await db.enrollment.count({ where: { id: a.enrollmentId } })).toBe(0);
    expect(await db.attendanceRecord.count({ where: { sessionId: session.id } })).toBe(0);
    expect(await db.grade.count({ where: { assessmentId: assess.id } })).toBe(0);
    expect(await db.notification.count({ where: { href: `/students/${a.studentId}` } })).toBe(0);
    expect(await db.guardian.count({ where: { id: a.guardianId } })).toBe(1); // l'autre enfant reste
    expect(await db.student.count({ where: { id: sibling.studentId } })).toBe(1);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "student.delete", entityId: a.studentId } });
    expect(log.details).toMatchObject({ code: "D-1", reason: "doublon de dossier", payments: 1, collected: 10000, receiptNos: [p.receiptNo] });

    const next = await recordPayment({ studentId: sibling.studentId, amount: 10000, modeId: "mode_especes", reference: null, paidAt: "2026-10-01", note: null, invoiceIds: [] }, ids.admin);
    expect(Number(next.receiptNo.split("-")[2])).toBeGreaterThan(Number(p.receiptNo.split("-")[2]));

    expect((await students.removeStudent(single.studentId, fd({ reason: "départ définitif" })))?.ok).toBe(true);
    expect(await db.guardian.count({ where: { id: single.guardianId } })).toBe(0); // parent sans autre enfant
    expect(await db.user.count({ where: { id: parent.id } })).toBe(0); // et son accès au portail
  });

  it("supprimer un enseignant retire sa fiche, ses paies et son compte, garde ses groupes et les dépenses", async () => {
    const account = await db.user.create({ data: { email: "prof@test.tn", fullName: "Prof", role: "ENSEIGNANT", teacherId: ids.teacher, passwordHash: "x" } });
    const expense = await db.expense.findUniqueOrThrow({ where: { teacherPayId: ids.pay } });
    await loginAs("ADMIN");
    expect((await teachers.removeTeacher(ids.teacher, fd({ reason: "fin de contrat" })))?.ok).toBe(true);
    expect(await db.teacher.count({ where: { id: ids.teacher } })).toBe(0);
    expect(await db.teacherPay.count({ where: { id: ids.pay } })).toBe(0);
    expect(await db.user.count({ where: { id: account.id } })).toBe(0);
    expect((await db.group.findUniqueOrThrow({ where: { id: ids.group } })).teacherId).toBeNull();
    expect((await db.expense.findUniqueOrThrow({ where: { id: expense.id } })).teacherPayId).toBeNull();

    // Le numéro P-2026-000001, déjà remis à l'enseignant, ne resservira pas
    const t = await db.teacher.create({ data: { firstName: "Nouveau", lastName: "Prof", phone: "22 333 333", payMode: "MENSUEL", payRate: 100000 } });
    const pay = await draftPay(t.id, "2026-10", ids.admin);
    await validatePay(pay.id, 0, null, ids.admin);
    expect(await markPayPaid(pay.id, { modeId: "mode_especes", paidAt: "2026-10-31", reference: null }, ids.admin)).toBe("P-2026-000002");
  });
});

describe("suppression d'un groupe", () => {
  const groups = import("@/app/(app)/academics/actions");
  async function newGroup(name: string) {
    return db.group.create({ data: { name, schoolYearId: ids.year, levelId: ids.level, subjectId: ids.subject, capacity: 10, monthlyFee: 40000 } });
  }
  async function enroll(groupId: string, code: string) {
    const s = await db.student.create({ data: { code, firstName: "E", lastName: code, status: "ACTIF" } });
    const e = await db.enrollment.create({ data: { studentId: s.id, groupId, startDate: new Date("2026-09-15T12:00:00Z"), baseFee: 40000, monthlyFee: 40000 } });
    const inv = await db.invoice.create({ data: { enrollmentId: e.id, period: "2026-09", amount: 40000, dueDate: new Date("2026-09-20T12:00:00Z") } });
    return { studentId: s.id, enrollmentId: e.id, invoiceId: inv.id };
  }

  it("un groupe vide : responsable autorisé, pas de motif, créneaux effacés ; comptable et parent refusés", async () => {
    const { removeGroup } = await groups;
    const room = await db.room.create({ data: { name: "Salle G", capacity: 20 } });
    const g = await newGroup("Vide");
    const slot = await db.scheduleSlot.create({ data: { groupId: g.id, roomId: room.id, weekday: 2, startMin: 600, endMin: 660 } });
    await loginAs("COMPTABLE");
    expect((await removeGroup(g.id, fd({})))?.error).toMatch(/Accès refusé/);
    await loginAs("PARENT");
    expect((await removeGroup(g.id, fd({})))?.error).toMatch(/Accès refusé/);
    await loginAs("RESPONSABLE");
    expect((await removeGroup(g.id, fd({})))?.ok).toBe(true);
    expect(await db.group.count({ where: { id: g.id } })).toBe(0);
    expect(await db.scheduleSlot.count({ where: { id: slot.id } })).toBe(0);
    expect(await db.room.count({ where: { id: room.id } })).toBe(1);
    expect(await db.auditLog.count({ where: { action: "group.delete", entityId: g.id } })).toBe(1);
    expect((await removeGroup(g.id, fd({})))?.error).toMatch(/déjà été supprimé/);
  });

  it("un groupe avec données : administrateur et motif obligatoires, les élèves et leurs autres groupes restent", async () => {
    const { removeGroup } = await groups;
    const g = await newGroup("Avec données");
    const other = await newGroup("Autre groupe");
    const a = await enroll(g.id, "G-1");
    const keep = await db.enrollment.create({ data: { studentId: a.studentId, groupId: other.id, startDate: new Date("2026-09-15T12:00:00Z"), baseFee: 40000, monthlyFee: 40000 } });
    const session = await db.attendanceSession.create({ data: { groupId: g.id, date: new Date("2026-10-02T00:00:00Z"), records: { create: { studentId: a.studentId, status: "ABSENT" } } } });
    const assess = await db.assessment.create({ data: { groupId: g.id, title: "Devoir", kind: "DEVOIR", term: 1, date: new Date("2026-10-03T12:00:00Z"), grades: { create: { studentId: a.studentId, score: 12 } } } });
    await db.notification.create({ data: { type: "NOUVEL_INSCRIT", title: "x", permission: "students.read", dedupeKey: `enroll:${a.studentId}:${g.id}`, href: `/students/${a.studentId}` } });

    await loginAs("RESPONSABLE");
    expect((await removeGroup(g.id, fd({ reason: "erreur de création" })))?.error).toMatch(/seul un administrateur/);
    await loginAs("ADMIN");
    expect((await removeGroup(g.id, fd({ reason: "" })))?.error).toMatch(/motif/i);
    expect(await db.group.count({ where: { id: g.id } })).toBe(1);

    expect((await removeGroup(g.id, fd({ reason: "erreur de création" })))?.ok).toBe(true);
    expect(await db.group.count({ where: { id: g.id } })).toBe(0);
    expect(await db.enrollment.count({ where: { id: a.enrollmentId } })).toBe(0);
    expect(await db.invoice.count({ where: { id: a.invoiceId } })).toBe(0);
    expect(await db.attendanceRecord.count({ where: { sessionId: session.id } })).toBe(0);
    expect(await db.grade.count({ where: { assessmentId: assess.id } })).toBe(0);
    expect(await db.notification.count({ where: { dedupeKey: `enroll:${a.studentId}:${g.id}` } })).toBe(0);
    expect(await db.student.count({ where: { id: a.studentId } })).toBe(1);
    expect(await db.enrollment.count({ where: { id: keep.id } })).toBe(1);
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "group.delete", entityId: g.id } });
    expect(log.details).toMatchObject({ name: "Avec données", reason: "erreur de création", enrollments: 1, sessions: 1, assessments: 1, studentCodes: ["G-1"] });
    // Le nom est de nouveau disponible pour cette année
    expect((await newGroup("Avec données")).name).toBe("Avec données");
  });

  it("refuse la suppression dès qu'un paiement, même annulé, porte sur le groupe, sans rien effacer", async () => {
    const { removeGroup } = await groups;
    const g = await newGroup("Payé");
    const a = await enroll(g.id, "G-2");
    const p = await recordPayment({ studentId: a.studentId, amount: 10000, modeId: "mode_especes", reference: null, paidAt: "2026-10-01", note: null, invoiceIds: [] }, ids.admin);
    await loginAs("ADMIN");
    expect((await removeGroup(g.id, fd({ reason: "essai de suppression" })))?.error).toMatch(/paiements sont enregistrés/);
    await db.payment.update({ where: { id: p.id }, data: { cancelledAt: new Date(), cancelReason: "test" } });
    expect((await removeGroup(g.id, fd({ reason: "essai de suppression" })))?.error).toMatch(/paiements sont enregistrés/);
    expect(await db.group.count({ where: { id: g.id } })).toBe(1);
    expect(await db.enrollment.count({ where: { id: a.enrollmentId } })).toBe(1);
    expect(await db.payment.count({ where: { id: p.id } })).toBe(1);
  });
});

describe("remise à zéro de la base (npm run data:reset)", () => {
  const url = process.env.TEST_DATABASE_URL!.replace(/\/[^/?]+(\?|$)/, "/vamos_reset_test$1");
  const env = { ...process.env, DATABASE_URL: url, SEED_DEMO: "true", DEV_ADMIN_PASSWORD: "NeDoitPasServir2026" };
  const run = (...args: string[]) => spawnSync("npx", ["tsx", "scripts/reset-data.ts", ...args], { env, encoding: "utf8" });
  const KEEP = ["--keep-email", "swekibassem790@gmail.com", "--keep-name", "Bassem Sweki"];

  it("sans --yes rien ne change ; avec --yes seul le compte demandé reste, mot de passe conservé", async () => {
    await db.$executeRawUnsafe(`DROP DATABASE IF EXISTS vamos_reset_test`);
    await db.$executeRawUnsafe(`CREATE DATABASE vamos_reset_test`);
    execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
    const { createPrismaClient } = await import("@/server/prisma-client");
    const target = createPrismaClient(url);
    try {
      const hash = await auth.hashPassword("MotDePasseConserve2026");
      await target.user.create({ data: { email: "swekibassem790@gmail.com", fullName: "Ancien Nom", role: "COMPTABLE", passwordHash: hash, mustChangePassword: false } });
      await target.user.create({ data: { email: "autre@test.tn", fullName: "Autre", role: "ADMIN", passwordHash: "x" } });
      await target.student.create({ data: { code: "Z-1", firstName: "Z", lastName: "Z" } });

      expect(run().status).toBe(1); // arguments obligatoires
      const dry = run(...KEEP);
      expect(dry.status).toBe(0);
      expect(dry.stdout).toMatch(/Aucune modification/);
      expect(dry.stdout).not.toMatch(/postgresql:/); // pas d'URL complète dans la sortie
      expect(await target.user.count()).toBe(2);
      expect(await target.student.count()).toBe(1);

      const done = run(...KEEP, "--yes");
      expect(done.status).toBe(0);
      const remaining = await target.user.findMany();
      expect(remaining).toHaveLength(1);
      expect(remaining[0]).toMatchObject({ email: "swekibassem790@gmail.com", fullName: "Bassem Sweki", role: "ADMIN", active: true, passwordHash: hash, mustChangePassword: false });
      expect(await target.student.count()).toBe(0);
      expect(await target.group.count()).toBe(0);
      expect(await target.schoolYear.count()).toBeGreaterThan(0); // référentiel recréé pour que l'application fonctionne
      expect(await target.paymentMode.count()).toBeGreaterThan(0);
      expect(await target.auditLog.count({ where: { action: "data.reset" } })).toBe(1);
      expect(Number((await target.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "_prisma_migrations"`)[0].n)).toBeGreaterThan(0); // migrations intactes

      // Compte absent : créé avec un mot de passe provisoire
      await target.user.deleteMany();
      const created = run(...KEEP, "--yes");
      expect(created.stdout).toMatch(/Mot de passe provisoire/);
      expect((await target.user.findFirstOrThrow()).mustChangePassword).toBe(true);
    } finally {
      await target.$disconnect();
      await db.$executeRawUnsafe(`DROP DATABASE IF EXISTS vamos_reset_test`);
    }
  }, 180_000);
});
