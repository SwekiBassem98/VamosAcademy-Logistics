/**
 * Création sécurisée d'un compte administrateur (à exécuter sur le serveur, jamais via l'interface web).
 *
 *   npm run admin:create -- --email direction@vamos-academy.tn --name "Prénom Nom"
 *
 * Le mot de passe provisoire est GÉNÉRÉ aléatoirement et affiché UNE seule fois dans ce terminal (il n'est écrit
 * dans aucun fichier ni journal). L'administrateur devra le remplacer à sa première connexion.
 * Option --password-from-env : utilise ADMIN_PASSWORD (≥ 12 caractères, lettres et chiffres) au lieu d'en générer un.
 */
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { createPrismaClient, loadEnvFile } from "../src/server/prisma-client";

loadEnvFile();
const db = createPrismaClient();

function arg(name: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function generatePassword() {
  // 18 caractères sans caractères ambigus, au moins une lettre et un chiffre
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  for (;;) {
    const bytes = randomBytes(18);
    const p = [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
    if (/[a-zA-Z]/.test(p) && /\d/.test(p)) return p;
  }
}

async function main() {
  const email = arg("email")?.trim().toLowerCase();
  const name = arg("name")?.trim();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) {
    console.error('Usage : npm run admin:create -- --email adresse@domaine.tn --name "Prénom Nom" [--password-from-env]');
    process.exit(1);
  }
  if (await db.user.findUnique({ where: { email } })) {
    console.error(`Un compte existe déjà avec l'adresse ${email}. Aucun changement effectué.`);
    process.exit(1);
  }
  let password: string;
  if (process.argv.includes("--password-from-env")) {
    password = process.env.ADMIN_PASSWORD ?? "";
    if (password.length < 12 || !/[a-zA-Z]/.test(password) || !/\d/.test(password)) {
      console.error("ADMIN_PASSWORD doit contenir au moins 12 caractères, des lettres et des chiffres.");
      process.exit(1);
    }
  } else {
    password = generatePassword();
  }
  const user = await db.user.create({
    data: { email, fullName: name, role: "ADMIN", passwordHash: await bcrypt.hash(password, 12), mustChangePassword: true },
  });
  await db.auditLog.create({ data: { userId: null, action: "user.bootstrap", entity: "User", entityId: user.id, details: { email, role: "ADMIN" } } });
  console.log(`\nCompte administrateur créé : ${email}`);
  if (!process.argv.includes("--password-from-env")) {
    console.log(`Mot de passe provisoire (affiché une seule fois) : ${password}`);
  }
  console.log("Il devra être remplacé à la première connexion.\n");
}

main().finally(() => db.$disconnect());
