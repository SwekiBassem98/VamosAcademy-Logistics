/** Intégration : connexion, verrouillage après 5 échecs, session. Base *_test (cf. finance.integration.test.ts). */
import { beforeAll, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL!;
const jar = new Map<string, string>();
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined),
    set: (k: string, v: string) => jar.set(k, v),
    delete: (k: string) => jar.delete(k),
  }),
}));

const { db } = await import("@/server/db");
const auth = await import("@/server/auth");

beforeAll(async () => {
  await db.user.deleteMany({ where: { email: { endsWith: "@auth.test" } } });
  const passwordHash = await bcrypt.hash("Secret2026x", 4);
  await db.user.createMany({
    data: [
      { email: "ok@auth.test", fullName: "OK", role: "RESPONSABLE", passwordHash },
      { email: "lock@auth.test", fullName: "Lock", role: "RESPONSABLE", passwordHash },
      { email: "off@auth.test", fullName: "Off", role: "ADMIN", passwordHash, active: false },
    ],
  });
});

describe("authentification", () => {
  it("connecte avec le bon mot de passe et crée une session hachée", async () => {
    expect(await auth.login("ok@auth.test", "Secret2026x")).toEqual({ ok: true });
    const token = jar.get(auth.SESSION_COOKIE)!;
    expect(token).toBeTruthy();
    expect(await db.session.count({ where: { tokenHash: token } })).toBe(0); // jeton jamais stocké en clair
    expect((await auth.getCurrentUser())?.email).toBe("ok@auth.test");
    await auth.logout();
    expect(jar.has(auth.SESSION_COOKIE)).toBe(false);
  });

  it("refuse un compte désactivé avec un message générique", async () => {
    expect(await auth.login("off@auth.test", "Secret2026x")).toEqual({ ok: false, error: "E-mail ou mot de passe incorrect." });
  });

  it("verrouille le compte après 5 échecs, même avec le bon mot de passe ensuite", async () => {
    for (let i = 0; i < 5; i++) expect((await auth.login("lock@auth.test", "mauvais")).ok).toBe(false);
    const r = await auth.login("lock@auth.test", "Secret2026x");
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/verrouillé/);
  });
});
