import "server-only";

/**
 * Journalisation des erreurs serveur sans données personnelles : on ne garde que le type, le code et la
 * première ligne du message (tronquée). Les erreurs Prisma contiennent parfois les valeurs de la requête
 * (noms, téléphones…) dans les lignes suivantes : elles ne sont jamais écrites.
 */
export function logError(context: string, e: unknown) {
  const err = e as { name?: string; code?: string; message?: string; digest?: string };
  const first = String(err?.message ?? e).split("\n").find((l) => l.trim()) ?? "";
  const safe = first.replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]").replace(/\b\d{8}\b/g, "[nombre]").slice(0, 200);
  console.error(`[${new Date().toISOString()}] ${context} ${err?.name ?? "Error"}${err?.code ? ` ${err.code}` : ""}: ${safe}`);
}
