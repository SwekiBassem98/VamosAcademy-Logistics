/**
 * Remise à zéro de la base : efface TOUTES les données et ne garde qu'un seul compte administrateur.
 * Le référentiel (centre, année, niveaux, matières, salles, moyens de paiement, modèles) est ensuite recréé par le seed.
 *
 * Sans --yes, le script ne modifie rien : il affiche la base visée et ce qui serait effacé.
 *
 *   npm run data:reset -- --keep-email adresse@domaine.tn --keep-name "Prénom Nom"
 *   npm run data:reset -- --keep-email adresse@domaine.tn --keep-name "Prénom Nom" --yes
 *
 * Si le compte existe, son mot de passe est conservé. Sinon, un mot de passe provisoire est généré et affiché une seule fois.
 * IRRÉVERSIBLE : faire une sauvegarde avant (./scripts/backup.sh).
 */
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
import bcrypt from "bcryptjs";
import { createPrismaClient, loadEnvFile } from "../src/server/prisma-client";

loadEnvFile();

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function generatePassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  for (;;) {
    const p = [...randomBytes(18)].map((b) => alphabet[b % alphabet.length]).join("");
    if (/[a-zA-Z]/.test(p) && /\d/.test(p)) return p;
  }
}

const quote = (t: string) => `"${t.replace(/"/g, '""')}"`;

async function main() {
  const email = arg("keep-email")?.trim().toLowerCase();
  const fullName = arg("keep-name")?.trim();
  const execute = process.argv.includes("--yes");
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !fullName) {
    console.error('Usage : npm run data:reset -- --keep-email adresse@domaine.tn --keep-name "Prénom Nom" [--yes]');
    process.exitCode = 1;
    return;
  }
  const url = new URL(process.env.DATABASE_URL ?? "");
  const db = createPrismaClient();
  try {
    console.log(`Base visée : ${url.hostname}${url.pathname}`); // jamais l'identifiant ni le mot de passe

    const tables = (await db.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations' ORDER BY tablename
    `).map((t) => t.tablename);
    if (!tables.includes("User")) throw new Error("Table User absente : appliquez d'abord les migrations (npm run db:deploy).");

    let total = 0;
    for (const t of tables) {
      const [{ n }] = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT count(*) AS n FROM ${quote(t)}`);
      total += Number(n);
      if (Number(n)) console.log(`  ${t} : ${n}`);
    }
    console.log(`Total : ${total} ligne(s) à effacer.`);

    const existing = await db.user.findUnique({ where: { email } });
    console.log(existing ? `Compte conservé : ${email} (mot de passe inchangé), rôle ADMIN.` : `Compte à créer : ${email}, rôle ADMIN, mot de passe provisoire généré.`);
    if (!execute) {
      console.log("\nAucune modification effectuée. Relancez avec --yes pour exécuter, après une sauvegarde.");
      return;
    }

    const password = existing ? null : generatePassword();
    const passwordHash = existing?.passwordHash ?? (await bcrypt.hash(password!, 12));
    const kept = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map(quote).join(", ")} RESTART IDENTITY CASCADE`);
      return tx.user.create({
        data: {
          ...(existing ? { id: existing.id, lastLoginAt: existing.lastLoginAt, createdAt: existing.createdAt } : {}),
          email, fullName, role: "ADMIN", active: true, passwordHash, mustChangePassword: existing?.mustChangePassword ?? true,
        },
      });
    }, { timeout: 120_000 });

    // Sans démo ni compte de développement : uniquement le référentiel nécessaire au fonctionnement
    const env = { ...process.env };
    delete env.SEED_DEMO;
    delete env.DEV_ADMIN_PASSWORD;
    const seed = spawnSync("npx", ["tsx", "prisma/seed.ts"], { env, stdio: "inherit" });
    await db.auditLog.create({ data: { userId: kept.id, action: "data.reset", entity: "System", details: { rowsDeleted: total, keptEmail: email, seedOk: seed.status === 0 } } });
    if (seed.status !== 0) {
      console.error("✖ Données effacées, mais le référentiel n'a pas pu être recréé. Relancez : npm run db:seed");
      process.exitCode = 1;
      return;
    }

    console.log(`\n✔ Base remise à zéro. Compte conservé : ${email}. Toutes les sessions ont été fermées.`);
    if (password) console.log(`  Mot de passe provisoire (affiché une seule fois, à changer à la connexion) : ${password}`);
  } finally {
    await db.$disconnect();
  }
}

main().catch((e) => {
  console.error("✖", e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
