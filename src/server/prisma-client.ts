import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/** Client Prisma 7 (adaptateur pg). Sans `server-only` : utilisé aussi par le seed et les scripts. */
export function createPrismaClient(url = process.env.DATABASE_URL) {
  if (!url) throw new Error("DATABASE_URL manquant");
  // Serverless (Vercel) : beaucoup d'instances éphémères → petit pool par instance, à utiliser avec l'URL « pooled » de l'hébergeur.
  const pool = process.env.VERCEL ? { max: 3, idleTimeoutMillis: 10_000 } : {};
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url, ...pool }) });
}

/** Scripts lancés avec tsx : charge .env s'il existe (sans écraser les variables déjà définies). */
export function loadEnvFile() {
  try {
    process.loadEnvFile();
  } catch {
    // pas de fichier .env
  }
}
