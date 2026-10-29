/**
 * Audit fonctionnel automatisé (outil QA, à lancer sur une base de test ou de démonstration, jamais en production).
 * Pour chaque rôle : ouvre une session temporaire, parcourt tous les liens internes affichés (pages, exports, PDF),
 * et signale : liens morts (404/500), pages en erreur, et liens visibles qui mènent à « Accès refusé ».
 *
 *   QA_BASE_URL=http://localhost:3100 npx tsx scripts/qa-crawl.ts
 */
import { createHash, randomBytes } from "node:crypto";
import { createPrismaClient, loadEnvFile } from "../src/server/prisma-client";

loadEnvFile();
const db = createPrismaClient();
const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
const MAX_PAGES = Number(process.env.QA_MAX_PAGES ?? 400);
const ROLES: [string, string][] = [
  ["ADMIN", process.env.QA_ADMIN_EMAIL ?? "admin@vamos-academy.tn"],
  ["RESPONSABLE", "responsable@demo.vamos-academy.tn"],
  ["COMPTABLE", "comptable@demo.vamos-academy.tn"],
  ["ENSEIGNANT", "enseignant@demo.vamos-academy.tn"],
  ["LECTURE", "lecture@demo.vamos-academy.tn"],
];
// (le texte de la page 404 est embarqué dans toutes les pages : une page introuvable se détecte par le statut HTTP 404)
const ERROR_MARKERS = ["Une erreur est survenue", "Application error", "Element type is invalid", "Internal Server Error"];

type Problem = { role: string; url: string; from: string; issue: string };

function normalize(href: string, from: string): string | null {
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return null;
  const u = new URL(href.replace(/&amp;/g, "&"), BASE + from);
  if (u.origin !== new URL(BASE).origin) return null;
  if (u.pathname.startsWith("/_next") || u.pathname === "/login") return null;
  u.searchParams.delete("print"); // évite l'impression automatique
  return u.pathname + u.search;
}

async function crawlRole(role: string, email: string): Promise<{ visited: number; problems: Problem[] }> {
  const user = await db.user.findUnique({ where: { email } });
  if (!user) return { visited: 0, problems: [{ role, url: "-", from: "-", issue: `compte ${email} absent` }] };
  const token = randomBytes(32).toString("base64url");
  const session = await db.session.create({ data: { userId: user.id, tokenHash: createHash("sha256").update(token).digest("hex"), expiresAt: new Date(Date.now() + 3600_000) } });
  const problems: Problem[] = [];
  const seen = new Set<string>();
  const queue: [string, string][] = [["/dashboard", "(départ)"]];
  try {
    while (queue.length && seen.size < MAX_PAGES) {
      const [url, from] = queue.shift()!;
      // une seule visite par « forme » d'URL avec identifiant, pour rester rapide
      const shape = url.replace(/[a-z0-9]{20,}/g, ":id").replace(/\?.*$/, (q) => (q.length > 60 ? "?…" : q));
      if (seen.has(shape)) continue;
      seen.add(shape);
      const res = await fetch(BASE + url, { headers: { cookie: `vamos_session=${token}` }, redirect: "manual" });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get("location") ?? "";
        if (loc.includes("/login")) problems.push({ role, url, from, issue: "redirection vers la connexion (session refusée)" });
        continue;
      }
      if (res.status === 403) { problems.push({ role, url, from, issue: "lien affiché mais accès refusé (403)" }); continue; }
      if (res.status >= 400) { problems.push({ role, url, from, issue: `HTTP ${res.status}` }); continue; }
      const type = res.headers.get("content-type") ?? "";
      if (!type.includes("text/html")) continue; // export, PDF, image : le statut suffit
      const html = await res.text();
      const marker = ERROR_MARKERS.find((m) => html.includes(m));
      if (marker) problems.push({ role, url, from, issue: `page en erreur : « ${marker} »` });
      if (html.includes("Accès refusé") && !url.startsWith("/dashboard")) problems.push({ role, url, from, issue: "lien affiché mais page « Accès refusé »" });
      for (const m of html.matchAll(/href="([^"]+)"/g)) {
        const next = normalize(m[1], url);
        if (next) queue.push([next, url]);
      }
    }
  } finally {
    await db.session.delete({ where: { id: session.id } });
  }
  return { visited: seen.size, problems };
}

async function main() {
  let total = 0;
  const all: Problem[] = [];
  for (const [role, email] of ROLES) {
    const r = await crawlRole(role, email);
    total += r.visited;
    all.push(...r.problems);
    console.log(`${role.padEnd(12)} ${String(r.visited).padStart(4)} page(s)/liens distincts, ${r.problems.length} problème(s)`);
  }
  for (const p of all) console.log(`  ✖ [${p.role}] ${p.url}  ← ${p.from}  : ${p.issue}`);
  console.log(`\nTotal : ${total} visites, ${all.length} problème(s).`);
  process.exitCode = all.length ? 1 : 0;
}

main().finally(() => db.$disconnect());
