import Link from "next/link";
import type { NotificationStatus, NotificationType, Prisma } from "@prisma/client";
import { PageHeader, Table, Td, Badge, EmptyState } from "@/components/ui";
import { Bulk, SelectAll, SelectRow } from "@/components/bulk";
import { FilterBar, Pagination, listParams, type Params } from "@/components/table-tools";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { syncAlerts, visibleWhere, TYPE_LABEL } from "@/server/services/notifications";
import { formatDateTime } from "@/lib/format";
import { updateNotifications } from "./actions";

export const metadata = { title: "Notifications" };
const PER = 40;
const STATUS_LABEL = { NOUVELLE: "Nouvelle", LUE: "Lue", TRAITEE: "Traitée" } as const;
const STATUS_TONE = { NOUVELLE: "red", LUE: "blue", TRAITEE: "green" } as const;

export default async function Notifications({ searchParams }: { searchParams: Promise<Params> }) {
  const user = await requireUser();
  await syncAlerts();
  const params = await searchParams;
  const { page } = listParams(params, ["createdAt"] as const, "createdAt", "desc");
  const status = (["NOUVELLE", "LUE", "TRAITEE"] as const).find((s) => s === params.status);
  const type = Object.keys(TYPE_LABEL).find((t) => t === params.type) as NotificationType | undefined;
  const where: Prisma.NotificationWhereInput = {
    AND: [visibleWhere(user), status ? { status: status as NotificationStatus } : params.status === "all" ? {} : { status: { not: "TRAITEE" } }, type ? { type } : {}],
  };
  const [total, list, counts] = await Promise.all([
    db.notification.count({ where }),
    db.notification.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER, take: PER }),
    db.notification.groupBy({ by: ["status"], where: visibleWhere(user), _count: { _all: true } }),
  ]);
  const count = (s: string) => counts.find((c) => c.status === s)?._count._all ?? 0;

  return (
    <>
      <PageHeader title="Notifications" subtitle={`${count("NOUVELLE")} nouvelle(s) · ${count("LUE")} lue(s) en attente · ${count("TRAITEE")} traitée(s)`} />
      <FilterBar params={params} keep={[]}>
        <select name="status" defaultValue={params.status ?? ""} className="input md:w-56" aria-label="Statut">
          <option value="">À traiter (nouvelles + lues)</option><option value="NOUVELLE">Nouvelles</option><option value="LUE">Lues</option><option value="TRAITEE">Traitées</option><option value="all">Toutes</option>
        </select>
        <select name="type" defaultValue={params.type ?? ""} className="input md:w-52" aria-label="Type">
          <option value="">Tous types</option>{Object.entries(TYPE_LABEL).filter(([k]) => user.role !== "ENSEIGNANT" || k === "ABSENCE" || k === "JUSTIFICATIF").map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </FilterBar>
      {list.length === 0 ? <EmptyState title="Aucune notification" text="Les nouveaux inscrits, paiements, absences, échéances et justificatifs manquants apparaissent ici." /> : (
        <Bulk noun="notification(s)" actions={[
          { label: "Marquer lues", action: updateNotifications, title: "Marquer comme lues ?", message: "Les notifications restent dans la liste « à traiter »", fields: { status: "LUE" }, variant: "secondary" },
          { label: "Marquer traitées", action: updateNotifications, title: "Marquer comme traitées ?", message: "Elles sortiront de la liste à traiter (historique conservé)", fields: { status: "TRAITEE" }, withReason: "Note de traitement", variant: "primary" },
        ]}>
          <Table head={[<SelectAll key="all" />, "Notification", "Date", "Type", "Statut", "Traitement"]} caption="Notifications">
            {list.map((n) => (
              <tr key={n.id} className={n.status === "NOUVELLE" ? "bg-brand-50/40" : ""}>
                <Td cell="select"><SelectRow id={n.id} label={n.title} /></Td>
                <Td cell="primary" className="lg:whitespace-normal">
                  {n.href ? <Link href={n.href} className="font-semibold text-navy hover:text-brand">{n.title}</Link> : <span className="font-semibold">{n.title}</span>}
                  {n.body && <span className="block text-sm text-muted">{n.body}</span>}
                </Td>
                <Td className="text-xs text-muted">{formatDateTime(n.createdAt)}</Td>
                <Td><Badge tone="gray">{TYPE_LABEL[n.type]}</Badge></Td>
                <Td><Badge tone={STATUS_TONE[n.status]} dot>{STATUS_LABEL[n.status]}</Badge></Td>
                <Td cell="wide" className="text-xs text-muted">{n.handledAt ? `${formatDateTime(n.handledAt)}${n.handledNote ? ` — ${n.handledNote}` : ""}` : ""}</Td>
              </tr>
            ))}
          </Table>
        </Bulk>
      )}
      <Pagination base="/notifications" params={params} page={page} total={total} perPage={PER} />
    </>
  );
}
