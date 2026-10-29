import "server-only";
import { db } from "./db";
import type { CurrentUser } from "./auth";
import { syncAlerts, visibleWhere } from "./services/notifications";
import type { Notice } from "@/components/topbar";

const TONE: Record<string, Notice["tone"]> = { RETARD: "red", ECHEANCE: "amber", ABSENCE: "amber", JUSTIFICATIF: "amber", PAIEMENT: "blue", NOUVEL_INSCRIT: "blue", SYSTEME: "blue" };

/** Cloche de la barre supérieure : notifications nouvelles visibles par l'utilisateur (alertes datées générées au passage). */
export async function noticesFor(user: CurrentUser): Promise<{ items: Notice[]; unread: number }> {
  await syncAlerts().catch((e) => console.error("syncAlerts", e));
  const where = { ...visibleWhere(user), status: "NOUVELLE" as const };
  const [unread, list] = await Promise.all([
    db.notification.count({ where }),
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 8 }),
  ]);
  return { unread, items: list.map((n) => ({ id: n.id, title: n.title, detail: n.body ?? "", href: n.href ?? "/notifications", tone: TONE[n.type] ?? "blue" })) };
}
