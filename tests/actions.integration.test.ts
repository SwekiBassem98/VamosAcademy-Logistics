/**
 * Intégration de bout en bout des Server Actions, exécutées avec une vraie session pour chaque rôle.
 * Vérifie que les permissions sont appliquées côté serveur (et pas seulement dans l'interface).
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
const grades = await import("@/app/(app)/grades/actions");
const payments = await import("@/app/(app)/payments/actions");
const settings = await import("@/app/(app)/settings/actions");
const { defaultBillingMonths } = await import("@/lib/billing");
const users = await import("@/app/(app)/users/actions");
const auth = await import("@/server/auth");
const teacher = await import("@/server/services/teacher");

const fd = (o: Record<string, string | string[] | undefined>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of [v ?? ""].flat()) f.append(k, x);
  return f;
};
const ids: Record<string, string> = {};

async function loginAs(role: Role, teacherId?: string) {
  const user = (teacherId && (await db.user.findUnique({ where: { teacherId } }))) ||
    (await db.user.create({ data: { email: `${role}-${randomBytes(3).toString("hex")}@test.tn`, fullName: `Test ${role}`, role, passwordHash: "x", teacherId } }));
  const token = randomBytes(32).toString("base64url");
  await db.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  jar.set("vamos_session", token);
  return user;
}

beforeAll(async () => {
  await resetTestDb(db, process.env.TEST_DATABASE_URL!);
  await seedPaymentModes(db);
  const year = await db.schoolYear.create({
    data: { label: "2026-2027", startDate: new Date("2026-09-01T12:00:00Z"), endDate: new Date("2027-06-30T12:00:00Z"), billingMonths: defaultBillingMonths(2026), dueDay: 10, active: true },
  });
  const cycle = await db.cycle.create({ data: { name: "Collège", order: 1 } });
  const level = await db.level.create({ data: { cycleId: cycle.id, name: "9e année de base", order: 1 } });
  const math = await db.subject.create({ data: { code: "MATH", name: "Mathématiques" } });
  const phys = await db.subject.create({ data: { code: "PHYS", name: "Physique" } });
  const r1 = await db.room.create({ data: { name: "Salle 1", capacity: 15 } });
  const r2 = await db.room.create({ data: { name: "Salle 2", capacity: 15 } });
  const small = await db.room.create({ data: { name: "Petite salle", capacity: 4 } });
  const t1 = await db.teacher.create({
    data: { firstName: "Prof", lastName: "Maths", phone: "22 111 111", subjects: { create: { subjectId: math.id } }, availability: { create: { weekday: 3, startMin: 840, endMin: 1080 } } },
  });
  const t2 = await db.teacher.create({ data: { firstName: "Prof", lastName: "Physique", phone: "22 222 222", subjects: { create: { subjectId: phys.id } } } });
  const g1 = await db.group.create({ data: { name: "Maths G1", schoolYearId: year.id, levelId: level.id, subjectId: math.id, teacherId: t1.id, roomId: r1.id, capacity: 2, monthlyFee: 50000, registrationFee: 10000 } });
  const g2 = await db.group.create({ data: { name: "Physique G1", schoolYearId: year.id, levelId: level.id, subjectId: phys.id, teacherId: t2.id, roomId: r2.id, capacity: 10, monthlyFee: 60000 } });
  await db.scheduleSlot.create({ data: { groupId: g1.id, roomId: r1.id, weekday: 3, startMin: 840, endMin: 960 } });
  const discount = await db.discountType.create({ data: { name: "Fratrie", percent: 10 } });
  Object.assign(ids, { year: year.id, level: level.id, math: math.id, phys: phys.id, r1: r1.id, r2: r2.id, small: small.id, t1: t1.id, t2: t2.id, g1: g1.id, g2: g2.id, discount: discount.id });
}, 60_000);

describe("permissions appliquées côté serveur", () => {
  it("la lecture seule ne peut pas créer d'élève", async () => {
    await loginAs("LECTURE");
    const res = await students.createStudent(null, fd({ firstName: "Test", lastName: "Lecture" }));
    expect(res?.error).toMatch(/Accès refusé/);
    expect(await db.student.count()).toBe(0);
  });
  it("le comptable ne peut pas créer d'élève ni de créneau", async () => {
    await loginAs("COMPTABLE");
    expect((await students.createStudent(null, fd({ firstName: "A", lastName: "B" })))?.error).toMatch(/Accès refusé/);
    expect((await academics.saveSlot(null, fd({ groupId: ids.g1, roomId: ids.r2, weekday: "1", start: "10:00", end: "11:00" })))?.error).toMatch(/Accès refusé/);
  });
  it("l'enseignant ne peut ni encaisser ni toucher aux groupes d'un collègue", async () => {
    await loginAs("ENSEIGNANT", ids.t1);
    expect((await payments.createPayment(null, fd({ studentId: "x", amount: "10", modeId: "mode_especes", paidAt: "2026-10-01" })))?.error).toMatch(/Accès refusé/);
    expect((await attendance.saveAttendance(ids.g2, "2026-10-14", null, fd({})))?.error).toMatch(/Accès refusé/);
    expect((await grades.saveAssessment(null, null, fd({ groupId: ids.g2, title: "X", kind: "DEVOIR", term: "1", date: "2026-10-14", coefficient: "1", maxScore: "20" })))?.error).toMatch(/Accès refusé/);
  });
});

describe("élèves & inscriptions (responsable administratif)", () => {
  it("crée un dossier avec matricule unique et parent", async () => {
    await loginAs("RESPONSABLE");
    const res = await students.createStudent(null, fd({ firstName: "Amine", lastName: "Ben Ali", birthDate: "2012-03-04", parent_lastName: "Ben Ali", parent_firstName: "Karim", parent_phone: "98123456", parent_relation: "Père" }));
    expect(res?.ok).toBe(true);
    const s = await db.student.findFirstOrThrow({ include: { guardians: { include: { guardian: true } } } });
    expect(s.code).toBe("VA-2026-0001");
    expect(s.guardians[0].guardian.phone).toBe("98 123 456");
    ids.amine = s.id;
  });
  it("bloque un doublon involontaire, accepte un homonyme confirmé", async () => {
    const dup = await students.createStudent(null, fd({ firstName: "amine", lastName: "BEN ALI" }));
    expect(dup?.error).toMatch(/Dossier similaire/);
    const ok = await students.createStudent(null, fd({ firstName: "Amine", lastName: "Ben Ali", birthDate: "2014-01-01", confirmNotDuplicate: "on" }));
    expect(ok?.ok).toBe(true);
    expect(await db.student.count()).toBe(2);
  });
  it("historise les modifications champ par champ", async () => {
    await students.updateStudent(ids.amine, null, fd({ firstName: "Amine", lastName: "Ben Ali", birthDate: "2012-03-04", className: "9e B", status: "ACTIF" }));
    const log = await db.auditLog.findFirstOrThrow({ where: { action: "student.update", entityId: ids.amine } });
    expect((log.details as { changes: { field: string }[] }).changes.map((c) => c.field)).toEqual(["className"]);
  });
  it("inscrit avec une réduction autorisée et génère l'échéancier", async () => {
    const res = await students.enrollStudent(ids.amine, null, fd({ groupId: ids.g1, startDate: "2026-10-15", discountTypeId: ids.discount, chargeRegistration: "on" }));
    expect(res?.ok).toBe(true);
    const e = await db.enrollment.findFirstOrThrow({ where: { studentId: ids.amine }, include: { invoices: true } });
    expect(e.monthlyFee).toBe(45000);
    expect(e.baseFee).toBe(50000);
    expect(e.invoices).toHaveLength(10); // inscription + octobre → juin
    expect((await students.enrollStudent(ids.amine, null, fd({ groupId: ids.g1, startDate: "2026-10-15" })))?.error).toMatch(/déjà inscrit/);
  });
  it("refuse une réduction non configurée et une date hors année", async () => {
    const other = await db.student.findFirstOrThrow({ where: { NOT: { id: ids.amine } } });
    expect((await students.enrollStudent(other.id, null, fd({ groupId: ids.g2, startDate: "2026-10-15", discountTypeId: "inexistante" })))?.error).toMatch(/non autorisée/);
    expect((await students.enrollStudent(other.id, null, fd({ groupId: ids.g2, startDate: "2027-08-01" })))?.error).toMatch(/dans l'année/);
  });
  it("refuse l'inscription dans un groupe complet", async () => {
    const other = await db.student.findFirstOrThrow({ where: { NOT: { id: ids.amine } } });
    await students.enrollStudent(other.id, null, fd({ groupId: ids.g1, startDate: "2026-10-15" }));
    const third = await db.student.create({ data: { code: "VA-2026-0099", firstName: "C", lastName: "D" } });
    expect((await students.enrollStudent(third.id, null, fd({ groupId: ids.g1, startDate: "2026-10-15" })))?.error).toMatch(/complet/);
  });
  it("archive un dossier : inscriptions terminées, échéances futures annulées (non supprimées), motif tracé", async () => {
    const third = await db.student.findUniqueOrThrow({ where: { code: "VA-2026-0099" } });
    await students.enrollStudent(third.id, null, fd({ groupId: ids.g2, startDate: "2026-10-15" }));
    expect(await students.archiveStudent(third.id, fd({ reason: "x" }))).toEqual({ error: expect.stringMatching(/motif/) });
    await students.archiveStudent(third.id, fd({ reason: "Déménagement" }));
    const s = await db.student.findUniqueOrThrow({ where: { id: third.id }, include: { enrollments: { include: { invoices: true } } } });
    expect(s.status).toBe("ARCHIVE");
    expect(s.enrollments[0].status).toBe("TERMINEE");
    const month = new Date().toISOString().slice(0, 7);
    const inv = s.enrollments[0].invoices;
    expect(inv.filter((i) => !i.cancelledAt).every((i) => i.period <= month)).toBe(true); // échéances futures non actives
    const voided = inv.filter((i) => i.cancelledAt);
    expect(voided.length).toBeGreaterThan(0); // jamais supprimées : annulées avec motif
    expect(voided.every((i) => i.cancelReason?.includes("Déménagement"))).toBe(true);
    expect((await students.enrollStudent(third.id, null, fd({ groupId: ids.g1, startDate: "2026-10-15" })))?.error).toMatch(/archivé/);
  });
});

describe("organisation pédagogique : conflits", () => {
  it("refuse un conflit de salle, de groupe, d'enseignant et hors disponibilité", async () => {
    await loginAs("RESPONSABLE");
    const slot = (o: Record<string, string>) => academics.saveSlot(null, fd({ groupId: ids.g2, roomId: ids.r2, weekday: "3", start: "14:00", end: "15:00", ...o }));
    expect((await slot({ roomId: ids.r1 }))?.error).toMatch(/Salle déjà occupée/);
    expect((await academics.saveSlot(null, fd({ groupId: ids.g1, roomId: ids.r2, weekday: "3", start: "15:00", end: "16:00" })))?.error).toMatch(/groupe a déjà un cours/);
    expect((await academics.saveSlot(null, fd({ groupId: ids.g1, roomId: ids.r1, weekday: "3", start: "17:00", end: "19:00" })))?.error).toMatch(/disponibilités/);
    expect((await slot({}))?.ok).toBe(true); // même horaire mais autre salle et autre enseignant : accepté
  });
  it("refuse une salle trop petite et un enseignant qui n'enseigne pas la matière", async () => {
    expect((await academics.saveSlot(null, fd({ groupId: ids.g2, roomId: ids.small, weekday: "5", start: "10:00", end: "11:00" })))?.error).toMatch(/trop petite/);
    const res = await academics.updateGroup(ids.g2, null, fd({ name: "Physique G1", levelId: ids.level, subjectId: ids.phys, teacherId: ids.t1, roomId: ids.r2, capacity: "10", monthlyFee: "60", registrationFee: "0", active: "on" }));
    expect(res?.error).toMatch(/n'enseigne pas/);
  });
});

describe("présences & notes (enseignant sur son groupe)", () => {
  it("fait l'appel avec justificatif", async () => {
    await loginAs("ENSEIGNANT", ids.t1);
    const [a, b] = await db.enrollment.findMany({ where: { groupId: ids.g1, status: "ACTIVE" }, select: { studentId: true } });
    const res = await attendance.saveAttendance(ids.g1, "2026-10-14", null, fd({ [`s_${a.studentId}`]: "EXCUSE", [`n_${a.studentId}`]: "Certificat médical", [`s_${b.studentId}`]: "ABSENT" }));
    expect(res?.message).toMatch(/1 absent/);
    const rec = await db.attendanceRecord.findFirstOrThrow({ where: { studentId: a.studentId } });
    expect(rec).toMatchObject({ status: "EXCUSE", note: "Certificat médical" });
    expect((await attendance.saveAttendance(ids.g1, "2099-01-01", null, fd({})))?.error).toMatch(/future/);
  });
  it("saisit des notes, refuse une note hors barème", async () => {
    await grades.saveAssessment(null, null, fd({ groupId: ids.g1, title: "Devoir 1", kind: "DEVOIR", term: "1", date: "2026-10-14", coefficient: "2", maxScore: "20" }));
    const a = await db.assessment.findFirstOrThrow();
    const [s1, s2] = await db.enrollment.findMany({ where: { groupId: ids.g1, status: "ACTIVE" }, select: { studentId: true } });
    expect((await grades.saveGrades(a.id, null, fd({ [`g_${s1.studentId}`]: "25" })))?.error).toMatch(/barème/);
    expect((await grades.saveGrades(a.id, null, fd({ [`g_${s1.studentId}`]: "14,5", [`c_${s1.studentId}`]: "Bien", [`g_${s2.studentId}`]: "" })))?.ok).toBe(true);
    expect(await db.grade.findMany({ select: { score: true, comment: true } })).toEqual([{ score: 14.5, comment: "Bien" }]);
  });
});

describe("paiements (comptable vs responsable)", () => {
  it("le responsable encaisse mais ne peut pas annuler ; le comptable peut", async () => {
    await loginAs("RESPONSABLE");
    expect((await payments.createPayment(null, fd({ studentId: ids.amine, amount: "45", modeId: "mode_especes", paidAt: "2026-10-20" })))?.ok).toBe(true);
    const p = await db.payment.findFirstOrThrow();
    expect((await payments.cancelPayment(p.id, fd({ reason: "Erreur" })))?.error).toMatch(/Accès refusé/);
    await loginAs("COMPTABLE");
    expect((await payments.cancelPayment(p.id, fd({ reason: "Erreur de saisie" })))?.ok).toBe(true);
    expect((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).cancelledAt).not.toBeNull();
  });
});

describe("données de démonstration", () => {
  it("la purge ne supprime que les données marquées démo (administrateur uniquement)", async () => {
    const demo = await db.student.create({ data: { code: "VA-2026-0500", firstName: "Démo", lastName: "Élève", isDemo: true } });
    await loginAs("RESPONSABLE");
    expect((await settings.purgeDemo(fd({ reason: "SUPPRIMER" })))?.error).toMatch(/Accès refusé/);
    await loginAs("ADMIN");
    expect((await settings.purgeDemo(fd({ reason: "non" })))?.error).toMatch(/SUPPRIMER/);
    const before = await db.student.count({ where: { isDemo: false } });
    expect((await settings.purgeDemo(fd({ reason: "SUPPRIMER" })))?.ok).toBe(true);
    expect(await db.student.findUnique({ where: { id: demo.id } })).toBeNull();
    expect(await db.student.count({ where: { isDemo: false } })).toBe(before);
  });
});

describe("espace enseignant", () => {
  it("refuse un accès administratif créé par erreur pour un enseignant", async () => {
    await loginAs("ADMIN");
    const base = { fullName: "Prof Physique", email: "physique@test.tn", password: "Provisoire2026x" };
    expect((await users.saveUser(null, null, fd({ ...base, teacherId: ids.t2 })))?.fieldErrors?.role).toBe("Choisissez un rôle");
    expect((await users.saveUser(null, null, fd({ ...base, role: "RESPONSABLE", teacherId: ids.t2 })))?.error).toMatch(/choisissez le rôle « Enseignant »/);
    expect(await db.user.count({ where: { email: base.email } })).toBe(0);
    expect((await users.saveUser(null, null, fd({ ...base, role: "ENSEIGNANT", teacherId: ids.t2 })))?.ok).toBe(true);
    const u = await db.user.findUniqueOrThrow({ where: { email: base.email } });
    expect([u.role, u.teacherId, u.mustChangePassword]).toEqual(["ENSEIGNANT", ids.t2, true]);
    expect((await users.saveUser(null, null, fd({ ...base, email: "autre@test.tn", role: "ENSEIGNANT", teacherId: ids.t2 })))?.error).toMatch(/déjà un compte/);
  });

  it("l'accueil enseignant ne contient que ses classes", async () => {
    await loginAs("ENSEIGNANT", ids.t1);
    const me = (await auth.getCurrentUser())!;
    const classes = await teacher.teacherClasses(me);
    expect(classes.map((c) => c.id)).toEqual([ids.g1]);
    const home = await teacher.teacherHome(me);
    expect(home.classes.map((c) => c.name)).toEqual(["Maths G1"]);
    expect(home.firstName).toBe("Prof");
    expect(home.occurrences.every((o) => o.cls.id === ids.g1 && o.weekday === 3)).toBe(true);
  });
});
