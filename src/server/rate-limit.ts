import "server-only";
import { headers } from "next/headers";
import { db } from "./db";

/**
 * Limiteur à fenêtre fixe stocké en base : partagé entre toutes les instances (hébergement serverless compris)
 * et conservé après un redémarrage.
 */
export async function hit(key: string, limit: number, windowMs: number): Promise<{ allowed: boolean; retryInMin: number }> {
  const now = new Date();
  const [b] = await db.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${key}, 1, ${new Date(now.getTime() + windowMs)})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN EXCLUDED."resetAt" ELSE "RateLimit"."resetAt" END
    RETURNING "count", "resetAt"`;
  // ménage occasionnel des fenêtres expirées
  if (Math.random() < 0.02) await db.rateLimit.deleteMany({ where: { resetAt: { lt: now } } });
  return { allowed: b.count <= limit, retryInMin: Math.ceil((b.resetAt.getTime() - now.getTime()) / 60_000) };
}

export async function resetBucket(key: string) {
  await db.rateLimit.deleteMany({ where: { key } });
}

/** Adresse du client : en-tête posé par le proxy inverse (nginx) ou par Vercel, sinon « inconnue ». */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "inconnue";
}
