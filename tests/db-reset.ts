import { execSync } from "node:child_process";
import type { PrismaClient } from "@prisma/client";

/** Applique les migrations puis vide la base de test. Refuse toute base dont le nom ne finit pas par _test. */
export async function resetTestDb(db: PrismaClient, url: string) {
  if (!/\/[^/?]+_test(\?|$)/.test(url)) throw new Error("TEST_DATABASE_URL doit pointer vers une base *_test");
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}
