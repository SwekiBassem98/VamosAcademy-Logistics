import { execSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

/** Base e2e remise à zéro, référentiel + données de démonstration, comptes de test connus. */
export default async function globalSetup() {
  const url = process.env.E2E_DATABASE_URL ?? "postgresql://MAC@localhost:5432/vamos_e2e_test?schema=public";
  if (!/\/[^/?]+_test(\?|$)/.test(url)) throw new Error("E2E_DATABASE_URL doit pointer vers une base *_test");
  const env = { ...process.env, DATABASE_URL: url };
  execSync("npx prisma migrate deploy", { env, stdio: "pipe" });
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
    await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
    execSync("npx tsx prisma/seed.ts", { env: { ...env, SEED_DEMO: "true", DEV_ADMIN_PASSWORD: "E2eAdmin2026xyz" }, stdio: "pipe" });
    // Compte au mot de passe provisoire (premier login)
    await db.user.create({
      data: { email: "nouveau@e2e.tn", fullName: "Nouvelle Secrétaire", role: "RESPONSABLE", passwordHash: await bcrypt.hash("Provisoire2026e2e", 10), mustChangePassword: true },
    });
  } finally {
    await db.$disconnect();
  }
}
