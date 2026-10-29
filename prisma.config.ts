import { defineConfig, env } from "prisma/config";

// Prisma 7 ne lit plus .env lui-même ; les variables déjà définies dans l'environnement restent prioritaires.
try {
  process.loadEnvFile();
} catch {
  // pas de fichier .env (production : variables fournies par systemd)
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations", seed: "tsx prisma/seed.ts" },
  datasource: { url: env("DATABASE_URL") },
});
