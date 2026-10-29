import "server-only";
import { headers } from "next/headers";

/**
 * Limiteur en mémoire (fenêtre glissante simple) pour les formulaires sensibles.
 * Suffisant pour une instance unique (déploiement prévu) ; avec plusieurs instances, utiliser un stockage partagé.
 */
const buckets = new Map<string, { count: number; reset: number }>();

export function hit(key: string, limit: number, windowMs: number): { allowed: boolean; retryInMin: number } {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { allowed: true, retryInMin: 0 };
  }
  b.count++;
  if (buckets.size > 10_000) for (const [k, v] of buckets) if (v.reset <= now) buckets.delete(k);
  return { allowed: b.count <= limit, retryInMin: Math.ceil((b.reset - now) / 60_000) };
}

export function resetBucket(key: string) {
  buckets.delete(key);
}

/** Adresse du client : en-tête posé par le proxy inverse (nginx), sinon « inconnue ». */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "inconnue";
}
