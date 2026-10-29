import Link from "next/link";
import type { MessageStatus, Prisma } from "@prisma/client";
import { Send } from "lucide-react";
import { PageHeader, Table, Td, Badge, Forbidden, LinkButton, EmptyState, Card, CardLink, buttonClass } from "@/components/ui";
import { Bulk, SelectAll, SelectRow } from "@/components/bulk";
import { CopyButton } from "@/components/copy-button";
import { FilterBar, Pagination, listParams, type Params } from "@/components/table-tools";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { formatDateTime } from "@/lib/format";
import { markSent, cancelMessages } from "./actions";

export const metadata = { title: "Messages & rappels" };
const PER = 40;
const STATUS = { PREPARE: ["À envoyer", "amber"], ENVOYE: ["Envoyé", "green"], ANNULE: ["Annulé", "gray"], ECHEC: ["Échec", "red"] } as const;

export default async function Messages({ searchParams }: { searchParams: Promise<Params> }) {
  if (!(await pageUser("messages.write"))) return <Forbidden />;
  const params = await searchParams;
  const { page } = listParams(params, ["createdAt"] as const, "createdAt", "desc");
  const status = (Object.keys(STATUS) as MessageStatus[]).find((s) => s === params.status);
  const where: Prisma.MessageWhereInput = {
    ...(params.batch ? { batchId: params.batch } : {}),
    ...(status ? { status } : params.status === "all" ? {} : params.batch ? {} : { status: "PREPARE" }),
    ...(params.template ? { templateId: params.template } : {}),
    ...(params.q ? { OR: [{ recipientName: { contains: params.q, mode: "insensitive" } }, { body: { contains: params.q, mode: "insensitive" } }] } : {}),
  };
  const [total, list, templates, pending] = await Promise.all([
    db.message.count({ where }),
    db.message.findMany({ where, include: { template: true }, orderBy: { createdAt: "desc" }, skip: (page - 1) * PER, take: PER }),
    db.messageTemplate.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.message.count({ where: { status: "PREPARE" } }),
  ]);

  return (
    <>
      <PageHeader title="Messages & rappels" subtitle={`${pending} message(s) préparé(s) en attente d'envoi. Aucun envoi automatique : copiez le texte ou ouvrez WhatsApp, puis confirmez l'envoi.`}
        primary={<LinkButton href="/messages/new"><Send /> Préparer des messages</LinkButton>} />
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Card title="Rappels de paiement"><p className="text-sm text-muted">Pour tous les élèves ayant des échéances échues.</p>
          {templates.find((t) => t.code === "RAPPEL_PAIEMENT") && <p className="mt-2"><CardLink href={`/messages/new?template=${templates.find((t) => t.code === "RAPPEL_PAIEMENT")!.id}&target=unpaid`}>Préparer les rappels →</CardLink></p>}
        </Card>
        <Card title="Absences du jour"><p className="text-sm text-muted">Informer les parents des élèves absents.</p>
          {templates.find((t) => t.code === "ABSENCE") && <p className="mt-2"><CardLink href={`/messages/new?template=${templates.find((t) => t.code === "ABSENCE")!.id}&target=absent:${new Date().toISOString().slice(0, 10)}`}>Préparer les messages →</CardLink></p>}
        </Card>
        <Card title="Enseignants"><p className="text-sm text-muted">Information à l&apos;équipe pédagogique.</p>
          {templates.find((t) => t.code === "INFO_ENSEIGNANT") && <p className="mt-2"><CardLink href={`/messages/new?template=${templates.find((t) => t.code === "INFO_ENSEIGNANT")!.id}&target=teachers`}>Préparer →</CardLink></p>}
        </Card>
      </div>
      <FilterBar params={params} keep={params.batch ? ["batch"] : []}
        search={<input name="q" type="search" defaultValue={params.q ?? ""} placeholder="Destinataire ou texte…" className="input" aria-label="Rechercher un message" />}>
        <select name="status" defaultValue={params.status ?? ""} className="input md:w-44" aria-label="Statut">
          <option value="">{params.batch ? "Tous" : "À envoyer"}</option>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}<option value="all">Tous</option>
        </select>
        <select name="template" defaultValue={params.template ?? ""} className="input md:w-52" aria-label="Modèle"><option value="">Tous modèles</option>{templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      </FilterBar>
      {params.batch && <p className="mb-2 text-sm text-success-700">Lot préparé. <Link href="/messages" className="text-brand">Voir tous les messages à envoyer</Link></p>}
      {list.length === 0 ? <EmptyState title="Aucun message" text="Préparez des rappels de paiement, des informations d'absence ou des messages aux enseignants." /> : (
        <Bulk noun="message(s)" actions={[
          { label: "Marquer envoyés", action: markSent, title: "Confirmer l'envoi ?", message: "Confirmez que vous avez bien envoyé ces messages vous-même (copie / WhatsApp)", variant: "primary" },
          { label: "Annuler", action: cancelMessages, title: "Annuler ces messages ?", message: "Ils ne seront pas envoyés (historique conservé)", withReason: "Motif" },
        ]}>
          <Table head={[<SelectAll key="a" />, "Destinataire", "Préparé le", "Message", "Statut", "Envoi"]} caption="Messages">
            {list.map((m) => {
              const tel = m.recipientPhone?.replace(/\s/g, "");
              return (
                <tr key={m.id} className="align-top">
                  <Td cell="select">{m.status === "PREPARE" && <SelectRow id={m.id} label={m.recipientName} />}</Td>
                  <Td cell="primary">{m.studentId ? <Link href={`/students/${m.studentId}`} className="font-semibold text-navy hover:text-brand">{m.recipientName}</Link> : <span className="font-semibold">{m.recipientName}</span>}<span className="block text-xs text-muted">{m.recipientPhone ?? "pas de téléphone"}</span></Td>
                  <Td className="text-xs text-muted">{formatDateTime(m.createdAt)}<span className="block">{m.template?.name}</span></Td>
                  <Td cell="wide" className="max-w-lg text-sm leading-relaxed lg:text-xs">{m.body}</Td>
                  <Td><Badge tone={STATUS[m.status][1]}>{STATUS[m.status][0]}</Badge>{m.sentAt && <span className="block text-xs text-muted">{formatDateTime(m.sentAt)}</span>}{m.error && <span className="block text-xs text-muted">{m.error}</span>}</Td>
                  <Td cell="actions" className="lg:space-y-1">
                    <CopyButton text={m.body} />
                    {tel && m.status === "PREPARE" && <a className={buttonClass({ variant: "secondary", size: "sm", className: "text-success-700" })} target="_blank" rel="noreferrer" href={`https://wa.me/216${tel}?text=${encodeURIComponent(m.body)}`}>Ouvrir WhatsApp</a>}
                  </Td>
                </tr>
              );
            })}
          </Table>
        </Bulk>
      )}
      <Pagination base="/messages" params={params} page={page} total={total} perPage={PER} />
    </>
  );
}
