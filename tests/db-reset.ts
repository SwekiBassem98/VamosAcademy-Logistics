import { execSync } from "node:child_process";
import type { PrismaClient } from "@prisma/client";

/** Applique les migrations puis vide la base de test. Refuse toute base dont le nom ne finit pas par _test. */
export async function resetTestDb(db: PrismaClient, url: string) {
  if (!/\/[^/?]+_test(\?|$)/.test(url)) throw new Error("TEST_DATABASE_URL doit pointer vers une base *_test");
  execSync("npx prisma migrate deploy", { env: { ...process.env, DATABASE_URL: url }, stdio: "pipe" });
  const tables = await db.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await db.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(", ")} RESTART IDENTITY CASCADE`);
}

/** Moyens de paiement par défaut (identiques à ceux insérés par la migration finance_communication). */
export async function seedPaymentModes(db: PrismaClient) {
  const modes = [["ESPECES", "Espèces", false], ["CHEQUE", "Chèque", true], ["VIREMENT", "Virement bancaire", true], ["D17", "D17 / e-Dinar", true]] as const;
  for (const [i, [code, label, requiresReference]] of modes.entries()) {
    await db.paymentMode.upsert({ where: { code }, update: {}, create: { id: `mode_${code.toLowerCase()}`, code, label, requiresReference, order: i + 1 } });
  }
}
