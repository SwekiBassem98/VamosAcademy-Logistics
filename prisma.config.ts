import { defineConfig } from "prisma/config";

// Prisma 7 ne lit plus .env lui-même ; les variables déjà définies dans l'environnement restent prioritaires.
try {
  process.loadEnvFile();
} catch {
  // pas de fichier .env (production : variables fournies par l'hébergeur ou systemd)
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  // Migrations : connexion directe si l'hébergeur en fournit une (Neon : DATABASE_URL_UNPOOLED), sinon DATABASE_URL.
  // Pas d'erreur si absente : `prisma generate` (postinstall) n'a pas besoin de base.
  datasource: { url: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL || "" },
});
