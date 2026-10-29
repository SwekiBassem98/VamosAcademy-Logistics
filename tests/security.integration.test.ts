/** Sécurité : changement de mot de passe obligatoire, durée de session, limitation des tentatives, journaux, exports. */
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { beforeAll, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
const jar = new Map<string, string>();
const hdrs = new Map<string, string>([["x-real-ip", "10.0.0.1"]]);
vi.mock("next/navigation", () => ({ redirect: vi.fn(), notFound: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined),
    set: (k: string, v: string) => jar.set(k, v),
    delete: (k: string) => jar.delete(k),
  }),
  headers: async () => ({ get: (k: string) => hdrs.get(k) ?? null }),
}));

const { db } = await import("@/server/db");
const { resetTestDb, seedPaymentModes } = await import("./db-reset");
const auth = await import("@/server/auth");
const { loginAction } = await import("@/app/login/actions");
const { changePassword } = await import("@/app/(app)/profile/actions");
const students = await import("@/app/(app)/students/actions");
const { GET: exportRoute } = await import("@/app/api/export/[kind]/route");
const { GET: healthRoute } = await import("@/app/api/health/route");
const { logError } = await import("@/server/log");
const { toCsv } = await import("@/server/exports");

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.append(k, v); return f; };
async function sessionFor(userId: string, createdAt = new Date()) {
  const token = randomBytes(32).toString("base64url");
  await db.session.create({ data: { userId, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000), createdAt } });
  jar.set("vamos_session", token);
}

beforeAll(async () => {
  await resetTestDb(db, process.env.TEST_DATABASE_URL!);
  await seedPaymentModes(db);
}, 60_000);

describe("sécurité", () => {
  it("un compte au mot de passe provisoire ne peut rien faire avant de le changer", async () => {
    const u = await db.user.create({ data: { email: "nouveau@sec.tn", fullName: "Nouveau", role: "ADMIN", passwordHash: await bcrypt.hash("Provisoire2026x", 4), mustChangePassword: true } });
    await sessionFor(u.id);
    expect((await students.createStudent(null, fd({ firstName: "A", lastName: "B" })))?.error).toMatch(/changez d'abord votre mot de passe/);
    const res = await exportRoute(new Request("http://x/api/export/students") as never, { params: Promise.resolve({ kind: "students" }) });
    expect(res.status).toBe(401);
    expect((await changePassword(null, fd({ current: "Provisoire2026x", next: "Provisoire2026x", confirm: "Provisoire2026x" })))?.error).toMatch(/différent/);
    expect((await changePassword(null, fd({ current: "Provisoire2026x", next: "Personnel2026abc", confirm: "Personnel2026abc" })))?.ok).toBe(true);
    expect((await db.user.findUniqueOrThrow({ where: { id: u.id } })).mustChangePassword).toBe(false);
    expect((await students.createStudent(null, fd({ firstName: "A", lastName: "B" })))?.error).toMatch(/année scolaire active/); // autorisé : échoue seulement faute d'année
  });

  it("une session expire au bout de 7 jours même si elle reste active", async () => {
    const u = await db.user.create({ data: { email: "vieux@sec.tn", fullName: "Vieux", role: "LECTURE", passwordHash: "x" } });
    await sessionFor(u.id, new Date(Date.now() - 8 * 86400_000));
    expect(await auth.getCurrentUser()).toBeNull();
    expect(await db.session.count({ where: { userId: u.id } })).toBe(0);
  });

  it("limite les tentatives de connexion par adresse IP (en plus du verrouillage par compte)", async () => {
    hdrs.set("x-real-ip", "203.0.113.9");
    let last;
    for (let i = 0; i < 21; i++) last = await loginAction(null, fd({ email: `inconnu${i}@sec.tn`, password: "mauvais" }));
    expect(last?.error).toMatch(/Trop de tentatives/);
    hdrs.set("x-real-ip", "203.0.113.10"); // un autre poste n'est pas bloqué
    expect((await loginAction(null, fd({ email: "inconnu@sec.tn", password: "mauvais" })))?.error).toMatch(/incorrect/);
  }, 60_000); // chaque échec coûte volontairement une comparaison bcrypt

  it("n'écrit aucune donnée personnelle ni le détail des requêtes dans les journaux", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    logError("test", Object.assign(new Error("Échec pour amine@exemple.tn tél 98123456\nArgs: { firstName: 'Amine', phone: '98 123 456' }"), { code: "P2002" }));
    const line = String(spy.mock.calls[0][0]);
    spy.mockRestore();
    expect(line).toContain("P2002");
    expect(line).not.toMatch(/amine@exemple|98123456|firstName|Amine/);
  });

  it("neutralise l'injection de formules dans les exports CSV", () => {
    const csv = toCsv({ title: "t", columns: [{ header: "Nom" }, { header: "Montant", money: true }], rows: [["=HYPERLINK(\"http://x\")", -12.5], ["@SUM(A1)", 3]] });
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'@SUM");
    expect(csv).toContain("-12,500"); // un montant négatif n'est pas pris pour une formule
  });

  it("la sonde de santé répond sans authentification ni donnée", async () => {
    const res = await healthRoute();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("le script de création d'administrateur génère un mot de passe fort et impose son changement", () => {
    const out = execFileSync("npx", ["tsx", "scripts/create-admin.ts", "--email", "direction@sec.tn", "--name", "Direction Test"], { env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL }, encoding: "utf8" });
    const pwd = /provisoire \(affiché une seule fois\) : (\S+)/.exec(out)?.[1] ?? "";
    expect(pwd).toMatch(/^[A-Za-z0-9]{18}$/);
    return db.user.findUniqueOrThrow({ where: { email: "direction@sec.tn" } }).then(async (u) => {
      expect(u.mustChangePassword).toBe(true);
      expect(await bcrypt.compare(pwd, u.passwordHash)).toBe(true);
      expect(() => execFileSync("npx", ["tsx", "scripts/create-admin.ts", "--email", "direction@sec.tn", "--name", "X"], { env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL }, stdio: "pipe" })).toThrow();
    });
  }, 60_000);
});
