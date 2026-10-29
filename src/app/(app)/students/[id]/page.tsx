import Link from "next/link";
import { notFound } from "next/navigation";
import { Archive, FileText, NotebookPen, Pencil, Phone as PhoneIcon, Printer, Wallet } from "lucide-react";
import { Card, CardLink, DescriptionList, PageHeader, Table, Td, Badge, LinkButton, Forbidden, Stat, DemoBadge, Phone as PhoneLink, buttonClass } from "@/components/ui";
import { Form, FormActions, Input, Select, Submit, Checkbox } from "@/components/form";
import { Sheet } from "@/components/sheet";
import { ConfirmAction } from "@/components/confirm";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { studentScope } from "@/server/scope";
import { studentInvoices } from "@/server/services/finance";
import { can } from "@/lib/permissions";
import { formatDate, formatDateTime, formatMoney, formatPeriod, todayISO } from "@/lib/format";
import { STATUS_LABEL as INV_LABEL } from "@/lib/billing";
import { ATTENDANCE_LABEL } from "@/lib/labels";
import { PLAN_LABEL } from "@/lib/billing";
import { FIELD_LABELS, type Change } from "@/lib/history";
import { weightedAverage, formatScore, KIND_LABEL } from "@/lib/grades";
import { StudentFields, levelOptions, STATUS_LABEL, STATUS_TONE } from "../student-fields";
import { updateStudent, addGuardian, updateGuardian, unlinkGuardian, enrollStudent, endEnrollment, archiveStudent, restoreStudent, changeTerms } from "../actions";

const INV_TONE = { PAYEE: "green", PARTIELLE: "amber", IMPAYEE: "gray", EN_RETARD: "red" } as const;
const ATT_TONE = { PRESENT: "green", ABSENT: "red", RETARD: "amber", EXCUSE: "blue" } as const;
const RELATIONS = ["Père", "Mère", "Tuteur légal", "Frère/Sœur", "Grand-parent", "Autre"].map((v) => ({ value: v, label: v }));


export const metadata = { title: "Dossier élève" };

export default async function StudentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const user = await pageUser("students.read");
  if (!user) return <Forbidden />;
  const { id } = await params;
  const { created } = await searchParams;
  const s = await db.student.findFirst({
    where: { id, ...studentScope(user) },
    include: {
      level: { include: { cycle: true } },
      guardians: { include: { guardian: true }, orderBy: { isPayer: "desc" } },
      enrollments: { include: { discountType: true, group: { include: { subject: true, teacher: true, schoolYear: true, level: true } } }, orderBy: { startDate: "desc" } },
    },
  });
  if (!s) notFound();

  const write = can(user.role, "students.write") && s.status !== "ARCHIVE";
  // Minimisation : coordonnées complètes réservées à l'administration (le téléphone du parent reste visible pour les urgences)
  const contacts = can(user.role, "students.write");
  const finance = can(user.role, "payments.read");
  const year = await db.schoolYear.findFirst({ where: { active: true } });
  const teacherGroups = user.role === "ENSEIGNANT" ? { group: { teacherId: user.teacherId ?? "" } } : {};
  const [invoices, payments, groups, discounts, levels, attendance, grades, history] = await Promise.all([
    finance ? studentInvoices(id, year?.id) : [],
    finance ? db.payment.findMany({ where: { studentId: id }, include: { schoolYear: true, mode: true, correctedBy: { select: { receiptNo: true } } }, orderBy: { paidAt: "desc" } }) : [],
    write && year ? db.group.findMany({
      where: { schoolYearId: year.id, active: true, enrollments: { none: { studentId: id } } },
      include: { subject: true, level: true, _count: { select: { enrollments: { where: { status: "ACTIVE" } } } } },
      orderBy: [{ subject: { name: "asc" } }, { name: "asc" }],
    }) : [],
    write ? db.discountType.findMany({ where: { active: true }, orderBy: { name: "asc" } }) : [],
    levelOptions(db),
    can(user.role, "attendance.read")
      ? db.attendanceRecord.findMany({ where: { studentId: id, session: teacherGroups }, include: { session: { include: { group: true } } }, orderBy: { session: { date: "desc" } }, take: 40 })
      : [],
    can(user.role, "grades.read")
      ? db.grade.findMany({ where: { studentId: id, assessment: teacherGroups }, include: { assessment: { include: { group: { include: { subject: true, schoolYear: true } } } } }, orderBy: { assessment: { date: "desc" } } })
      : [],
    can(user.role, "students.write") || can(user.role, "audit.read")
      ? db.auditLog.findMany({ where: { entity: "Student", entityId: id }, include: { user: { select: { fullName: true } } }, orderBy: { createdAt: "desc" }, take: 30 })
      : [],
  ]);

  const billed = invoices.reduce((t, i) => t + i.amount, 0);
  const paid = invoices.reduce((t, i) => t + i.paid, 0);
  const overdue = invoices.filter((i) => i.status === "EN_RETARD").reduce((t, i) => t + i.remaining, 0);
  const present = attendance.filter((a) => a.status === "PRESENT" || a.status === "RETARD").length;
  const avg = weightedAverage(grades.filter((g) => g.assessment.group.schoolYearId === year?.id).map((g) => ({ score: g.score, maxScore: g.assessment.maxScore, coefficient: g.assessment.coefficient })));

  const att = can(user.role, "attendance.read");
  const gr = can(user.role, "grades.read");
  const sections = [
    ["inscriptions", "Inscriptions"], ["contacts", "Parents"], ...(finance ? [["finances", "Finances"]] : []),
    ...(att ? [["presences", "Présences"]] : []), ...(gr ? [["notes", "Notes"]] : []), ["infos", "Informations"],
    ...(history.length ? [["historique", "Historique"]] : []),
  ];

  return (
    <>
      {created && <p role="status" className="mb-4 rounded-md border border-success-600/25 bg-success-50 px-3.5 py-2.5 text-sm text-success-700">Dossier créé avec le matricule <strong>{s.code}</strong>. Vous pouvez maintenant l&apos;inscrire dans un groupe.</p>}
      <PageHeader
        back={{ href: "/students", label: "Élèves" }}
        title={`${s.lastName} ${s.firstName}`}
        subtitle={<span>{s.code} · {s.level ? `${s.level.cycle.name} — ${s.level.name}` : "Niveau non renseigné"}{s.className && ` · ${s.className}`}{s.fullNameAr && <span dir="rtl" lang="ar" className="ml-2">{s.fullNameAr}</span>}</span>}
        meta={<>
          <Badge tone={STATUS_TONE[s.status]} dot>{STATUS_LABEL[s.status]}{s.archivedAt && ` le ${formatDate(s.archivedAt)}`}</Badge>
          {s.isDemo && <DemoBadge />}
          {s.medicalNotes && <Badge tone="amber">Remarque médicale</Badge>}
        </>}
        primary={finance && s.status !== "ARCHIVE" && can(user.role, "payments.write") && <LinkButton href={`/payments/new?student=${s.id}`}><Wallet /> Encaisser</LinkButton>}
        actions={<>
          {write && (
            <Sheet trigger={<><Pencil /> Modifier</>} variant="secondary" title="Modifier le dossier" description={`${s.lastName} ${s.firstName} · ${s.code}`}>
              <Form action={updateStudent.bind(null, s.id)} className="space-y-6">
                <StudentFields s={s} levels={levels} />
                <FormActions>
                  <Checkbox label="Homonyme confirmé (pas un doublon)" name="confirmNotDuplicate" className="mr-auto" />
                  <Submit />
                </FormActions>
              </Form>
            </Sheet>
          )}
          {contacts && <LinkButton href={`/students/${s.id}/fiche`} variant="secondary"><Printer /> Fiche d&apos;inscription</LinkButton>}
          {gr && <LinkButton href={`/students/${s.id}/bulletin`} variant="secondary"><NotebookPen /> Bulletin</LinkButton>}
          {finance && <LinkButton href={`/students/${s.id}/releve`} variant="secondary"><FileText /> Relevé de compte</LinkButton>}
          {can(user.role, "students.write") && (s.status === "ARCHIVE"
            ? <ConfirmAction action={restoreStudent.bind(null, s.id)} variant="secondary" label="Réactiver" title="Réactiver ce dossier ?" message="Le dossier repasse au statut actif. Les inscriptions terminées ne sont pas rouvertes." />
            : <ConfirmAction action={archiveStudent.bind(null, s.id)} label={<><Archive /> Archiver</>} title="Archiver ce dossier ?" withReason="Motif"
                message="Les inscriptions en cours seront terminées aujourd'hui et les mensualités futures non payées retirées. L'historique (paiements, notes, présences) est conservé." confirmLabel="Archiver" />)}
        </>}
      />

      <nav aria-label="Sections du dossier" className="no-print sticky top-[calc(3.5rem+env(safe-area-inset-top))] z-20 -mx-4 mb-5 border-b border-line bg-surface/95 px-4 backdrop-blur sm:-mx-6 sm:px-6 lg:hidden">
        <ul className="flex gap-1 overflow-x-auto py-2 [scrollbar-width:none]">
          {sections.map(([id, label]) => (
            <li key={id}><a href={`#${id}`} className="inline-flex min-h-9 items-center rounded-full border border-line bg-white px-3 text-sm font-medium whitespace-nowrap text-navy">{label}</a></li>
          ))}
        </ul>
      </nav>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {finance && <Stat label={`Reste à payer ${year?.label ?? ""}`} tone={overdue ? "brand" : "navy"} value={formatMoney(billed - paid)} hint={overdue ? `dont ${formatMoney(overdue)} en retard` : "aucun retard"} />}
        {finance && <Stat label="Déjà payé" tone="green" value={formatMoney(paid)} hint={`sur ${formatMoney(billed)} facturés`} />}
        {att && <Stat label="Assiduité" value={attendance.length ? `${Math.round((present / attendance.length) * 100)} %` : "—"} hint={`${attendance.filter((a) => a.status === "ABSENT").length} absence(s) sur ${attendance.length} séance(s)`} />}
        {gr && <Stat label="Moyenne (année)" value={avg == null ? "—" : `${formatScore(avg)} / 20`} hint={`${grades.length} note(s)`} />}
      </div>

      <div className="flex flex-col gap-6 lg:grid lg:grid-cols-3">
        <div className="min-w-0 max-lg:contents lg:col-span-2 lg:flex lg:flex-col lg:gap-6">
          <Card id="inscriptions" title="Inscriptions" description="Historique scolaire, tarifs et échéanciers" className="max-lg:order-1">
            <Table head={["Groupe", "Année", "Matière", "Entrée / sortie", "Tarif", "Statut", ""]} empty={s.enrollments.length === 0} emptyText="Aucune inscription : utilisez le formulaire ci-dessous.">
              {s.enrollments.map((e) => (
                <tr key={e.id}>
                  <Td cell="primary">{can(user.role, "academics.read") ? <Link className="font-semibold text-navy hover:text-brand" href={`/academics/groups/${e.groupId}`}>{e.group.name}</Link> : <span className="font-semibold">{e.group.name}</span>}<span className="block text-xs text-muted">{e.group.level.name}</span></Td>
                  <Td>{e.group.schoolYear.label}</Td>
                  <Td>{e.group.subject.name}</Td>
                  <Td className="text-xs">{formatDate(e.startDate)}{e.endDate && <> → {formatDate(e.endDate)}</>}</Td>
                  <Td cell="num">{formatMoney(e.monthlyFee)}
                    {e.discountPercent > 0 && <span className="block text-xs text-muted">{e.discountType?.name ?? "Réduction"} −{e.discountPercent} % (base {formatMoney(e.baseFee)})</span>}
                    <span className="block text-xs text-muted">{PLAN_LABEL[e.plan]}</span>
                  </Td>
                  <Td><Badge tone={e.status === "ACTIVE" ? "green" : "gray"}>{e.status === "ACTIVE" ? "en cours" : "terminée"}</Badge></Td>
                  <Td cell="actions">{write && e.status === "ACTIVE" && (
                    <ConfirmAction action={endEnrollment.bind(null, e.id)} small label="Terminer" ariaLabel={`Terminer l'inscription au groupe ${e.group.name}`} title={`Terminer l'inscription au groupe ${e.group.name} ?`}
                      message="Les mensualités postérieures à la date de sortie et non payées seront retirées.">
                      <label className="mt-4 block text-sm"><span className="font-medium text-ink-soft">Date de sortie</span>
                        <input type="date" name="endDate" defaultValue={todayISO()} className="input mt-1.5" /></label>
                    </ConfirmAction>
                  )}</Td>
                </tr>
              ))}
            </Table>
            {write && can(user.role, "payments.write") && s.enrollments.some((e) => e.status === "ACTIVE") && (
              <details className="mt-4 rounded-md border border-line">
                <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold text-navy">Modifier le tarif ou l&apos;échéancier d&apos;une inscription</summary>
                <div className="border-t border-line p-3">
                  <p className="text-xs text-muted">Les échéances non payées à partir du mois indiqué sont annulées (motif tracé) puis recréées ; celles déjà réglées, même partiellement, sont conservées.</p>
                  {s.enrollments.filter((e) => e.status === "ACTIVE").map((e) => (
                    <Form key={e.id} action={changeTerms.bind(null, e.id)} className="mt-3 grid items-end gap-3 rounded-md bg-surface p-3 sm:grid-cols-2 xl:grid-cols-5">
                      <p className="text-sm font-semibold sm:col-span-2 xl:col-span-5">{e.group.name}</p>
                      <Input label="Mensualité (DT)" name="monthlyFee" defaultValue={(e.monthlyFee / 1000).toFixed(3).replace(".", ",")} inputMode="decimal" />
                      <Select label="Échéancier" name="plan" defaultValue={e.plan} options={Object.entries(PLAN_LABEL).map(([value, label]) => ({ value, label }))} />
                      <Input label="À partir du mois" name="fromPeriod" type="month" defaultValue={todayISO().slice(0, 7)} />
                      <Input label="Motif *" name="reason" placeholder="ex. accord de la direction" />
                      <Submit variant="secondary">Appliquer</Submit>
                    </Form>
                  ))}
                </div>
              </details>
            )}
            {write && year && (
              <Form action={enrollStudent.bind(null, s.id)} className="mt-5 grid items-end gap-3 rounded-lg border border-navy-100 bg-navy-50/50 p-3 sm:grid-cols-2 sm:p-4 xl:grid-cols-4" resetOnSuccess>
                <p className="text-sm font-bold text-navy sm:col-span-2 xl:col-span-4">Nouvelle inscription — année {year.label}</p>
                <Select label="Groupe (matière · niveau) *" name="groupId" placeholder={groups.length ? "Choisir…" : "Aucun groupe disponible"} wrapperClass="sm:col-span-2"
                  options={groups.map((g) => ({
                    value: g.id,
                    label: `${g.subject.name} · ${g.level.name} · ${g.name} — ${formatMoney(g.monthlyFee)}/mois${g._count.enrollments >= g.capacity ? " (COMPLET)" : ` (${g.capacity - g._count.enrollments} pl.)`}`,
                  }))} />
                <Input label="Date d'entrée *" name="startDate" type="date" defaultValue={todayISO()} />
                <Select label="Échéancier" name="plan" options={Object.entries(PLAN_LABEL).map(([value, label]) => ({ value, label }))} />
                <Select label="Réduction autorisée" name="discountTypeId" placeholder="Aucune" options={discounts.map((d) => ({ value: d.id, label: `${d.name} (−${d.percent} %)` }))} />
                <Input label="Justification de la réduction" name="discountNote" wrapperClass="sm:col-span-2 xl:col-span-3" placeholder="ex. frère inscrit : VA-2026-0012" />
                <Checkbox label="Facturer les frais d'inscription du groupe" name="chargeRegistration" defaultChecked className="sm:col-span-2 xl:col-span-3" />
                <Submit className="max-sm:w-full">Inscrire</Submit>
              </Form>
            )}
          </Card>

          {finance && (
            <Card id="finances" title={`Échéancier ${year?.label ?? ""}`} className="max-lg:order-3" actions={<CardLink href={`/students/${s.id}/releve`}>Relevé de compte →</CardLink>}>
              <Table head={["Période", "Groupe", "Échéance", "Montant", "Payé", "Reste", "Statut"]} empty={invoices.length === 0} emptyText="Aucune échéance cette année.">
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <Td cell="primary" className="capitalize"><span className="font-semibold">{formatPeriod(i.period)}</span>{i.months > 1 && <span className="block text-xs normal-case text-muted">{i.months} mois</span>}</Td>
                    <Td>{i.enrollment.group.name}</Td>
                    <Td>{formatDate(i.dueDate)}</Td>
                    <Td cell="num">{formatMoney(i.amount)}</Td>
                    <Td cell="num">{formatMoney(i.paid)}</Td>
                    <Td cell="num" className="font-semibold">{formatMoney(i.remaining)}</Td>
                    <Td><Badge tone={INV_TONE[i.status]}>{INV_LABEL[i.status]}</Badge></Td>
                  </tr>
                ))}
              </Table>
              <h3 className="mt-6 mb-2 text-sm font-bold text-navy">Paiements — historique financier</h3>
              <Table head={["Reçu", "Année", "Date", "Mode", "Montant", ""]} empty={payments.length === 0} emptyText="Aucun paiement enregistré.">
                {payments.map((p) => (
                  <tr key={p.id} className={p.cancelledAt ? "text-muted" : ""}>
                    <Td cell="primary" className="font-mono text-sm">{p.receiptNo}</Td>
                    <Td>{p.schoolYear.label}</Td>
                    <Td>{formatDate(p.paidAt)}</Td>
                    <Td>{p.mode.label}</Td>
                    <Td cell="num" className={p.cancelledAt ? "line-through" : "font-semibold"}>{formatMoney(p.amount)}</Td>
                    <Td cell="actions">{p.correctedBy ? <Link href={`/payments/${p.id}`}><Badge tone="amber">corrigé → {p.correctedBy.receiptNo}</Badge></Link> : p.cancelledAt ? <Link href={`/payments/${p.id}`}><Badge tone="red">annulé</Badge></Link> : <LinkButton size="sm" variant="secondary" href={`/payments/${p.id}`}>Voir le reçu</LinkButton>}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          {att && (
            <Card id="presences" title="Présences" description="40 dernières séances" className="max-lg:order-4">
              <Table head={["Date", "Groupe", "Statut", "Motif / justificatif"]} empty={attendance.length === 0} emptyText="Aucune séance pointée.">
                {attendance.map((a) => (
                  <tr key={a.id}>
                    <Td cell="primary" className="font-semibold">{formatDate(a.session.date)}</Td>
                    <Td>{a.session.group.name}</Td>
                    <Td><Badge tone={ATT_TONE[a.status]}>{ATTENDANCE_LABEL[a.status]}</Badge></Td>
                    <Td cell="wide" className="text-xs">{a.note ?? ""}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          {gr && (
            <Card id="notes" title="Notes & appréciations" className="max-lg:order-5">
              <Table head={["Évaluation", "Date", "Groupe", "Note", "Appréciation"]} empty={grades.length === 0} emptyText="Aucune note.">
                {grades.map((g) => (
                  <tr key={g.id} className="align-top">
                    <Td cell="primary"><span className="font-semibold">{g.assessment.title}</span><span className="block text-xs text-muted">{KIND_LABEL[g.assessment.kind]} · T{g.assessment.term} · coef. {g.assessment.coefficient}</span></Td>
                    <Td>{formatDate(g.assessment.date)}</Td>
                    <Td>{g.assessment.group.subject.name}<span className="block text-xs text-muted">{g.assessment.group.schoolYear.label}</span></Td>
                    <Td cell="num" className="font-semibold">{g.score == null ? "abs." : `${formatScore(g.score)} / ${g.assessment.maxScore}`}</Td>
                    <Td cell="wide" className="text-xs">{g.comment ?? ""}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          {history.length > 0 && (
            <Card id="historique" title="Historique des modifications" className="max-lg:order-7">
              <ol className="space-y-3 text-sm">
                {history.map((h) => {
                  const d = (h.details ?? {}) as { changes?: Change[]; reason?: string; group?: string };
                  return (
                    <li key={h.id} className="border-l-2 border-line pl-3">
                      <p><span className="font-semibold text-navy">{ACTION_LABEL[h.action] ?? h.action}</span> <span className="text-xs text-muted">· {formatDateTime(h.createdAt)} · {h.user?.fullName ?? "Système"}</span></p>
                      {d.changes?.map((c) => <p key={c.field} className="text-xs text-ink-soft">{FIELD_LABELS[c.field] ?? c.field} : <span className="line-through">{String(c.from ?? "—")}</span> → <strong>{String(c.to ?? "—")}</strong></p>)}
                      {d.group && <p className="text-xs text-ink-soft">Groupe : {d.group}</p>}
                      {d.reason && <p className="text-xs text-ink-soft">Motif : {d.reason}</p>}
                    </li>
                  );
                })}
              </ol>
            </Card>
          )}
        </div>

        <div className="min-w-0 max-lg:contents lg:flex lg:flex-col lg:gap-6">
          <Card id="contacts" title="Parents & contacts d'urgence" className="max-lg:order-2">
            {s.guardians.length === 0 && <p className="text-sm text-muted">Aucun parent enregistré.</p>}
            <ul className="space-y-3">
              {s.guardians.map(({ guardian: g, relation, isPayer }) => (
                <li key={g.id} className="rounded-md border border-line p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-navy">{g.lastName} {g.firstName}</p>
                    <Badge tone="blue">{relation}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a href={`tel:${g.phone.replace(/\s/g, "")}`} className={buttonClass({ variant: "secondary", size: "sm" })}><PhoneIcon /> {g.phone}</a>
                    <a className={buttonClass({ variant: "secondary", size: "sm", className: "text-success-700" })} href={`https://wa.me/216${g.phone.replace(/\s/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a>
                  </div>
                  {g.phone2 && <p className="mt-2 text-muted">Autre numéro : <PhoneLink value={g.phone2} /></p>}
                  {contacts && g.email && <p className="mt-1 break-all text-muted">{g.email}</p>}
                  {isPayer && <p className="mt-1 text-xs font-medium text-muted">Responsable des paiements</p>}
                  {write && (
                    <details className="mt-2">
                      <summary className="inline-flex min-h-10 cursor-pointer items-center text-sm font-semibold text-brand">Modifier ce contact</summary>
                      <Form action={updateGuardian.bind(null, s.id, g.id)} className="mt-2 space-y-3">
                        <Select label="Lien" name="relation" defaultValue={relation} options={RELATIONS} />
                        <div className="grid gap-3 xs:grid-cols-2"><Input label="Nom *" name="lastName" defaultValue={g.lastName} /><Input label="Prénom *" name="firstName" defaultValue={g.firstName} /></div>
                        <Input label="Téléphone *" name="phone" type="tel" inputMode="tel" autoComplete="tel" defaultValue={g.phone} />
                        <Input label="Téléphone 2" name="phone2" type="tel" inputMode="tel" defaultValue={g.phone2 ?? ""} />
                        <Input label="E-mail" name="email" type="email" inputMode="email" defaultValue={g.email ?? ""} />
                        <Input label="Profession" name="profession" defaultValue={g.profession ?? ""} />
                        <Checkbox label="Responsable des paiements" name="isPayer" defaultChecked={isPayer} />
                        <Submit variant="secondary" className="max-sm:w-full">Enregistrer</Submit>
                      </Form>
                      <div className="mt-3 border-t border-line pt-3"><ConfirmAction action={unlinkGuardian.bind(null, s.id, g.id)} small label="Retirer ce contact" title="Retirer ce contact du dossier ?" message="Le parent n'est pas supprimé s'il est relié à d'autres élèves." /></div>
                    </details>
                  )}
                </li>
              ))}
            </ul>
            {write && (
              <details className="mt-4 rounded-md border border-dashed border-line-strong" open={s.guardians.length === 0}>
                <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm font-semibold text-navy">+ Ajouter un parent / contact</summary>
                <Form action={addGuardian.bind(null, s.id)} className="space-y-3 border-t border-line p-3" resetOnSuccess>
                  <Select label="Lien" name="relation" options={RELATIONS} />
                  <div className="grid gap-3 xs:grid-cols-2"><Input label="Nom *" name="lastName" /><Input label="Prénom *" name="firstName" /></div>
                  <Input label="Téléphone *" name="phone" type="tel" inputMode="tel" autoComplete="tel" placeholder="98 123 456" />
                  <Input label="Téléphone 2" name="phone2" type="tel" inputMode="tel" />
                  <Input label="E-mail" name="email" type="email" inputMode="email" />
                  <Input label="Profession" name="profession" />
                  <Checkbox label="Responsable des paiements" name="isPayer" />
                  <Submit variant="secondary" className="max-sm:w-full">Ajouter</Submit>
                </Form>
              </details>
            )}
          </Card>
          <Card id="infos" title="Informations" className="max-lg:order-6">
            <DescriptionList items={[
              ["Naissance", formatDate(s.birthDate)],
              ["Sexe", s.gender === "M" ? "Garçon" : s.gender === "F" ? "Fille" : "—"],
              ["Établissement", s.school ?? "—"],
              ...(contacts ? [["Téléphone", <PhoneLink key="p" value={s.phone} />] as [string, React.ReactNode], ["Adresse", s.address ?? "—"] as [string, React.ReactNode]] : []),
              ["Médical", s.medicalNotes ?? "—"],
              ["Remarques", s.notes ?? "—"],
              ["Dossier créé", formatDate(s.createdAt)],
            ]} />
          </Card>
        </div>
      </div>
    </>
  );
}

const ACTION_LABEL: Record<string, string> = {
  "student.create": "Création du dossier", "student.update": "Modification du dossier", "student.archive": "Archivage",
  "student.restore": "Réactivation", "guardian.link": "Ajout d'un parent", "guardian.unlink": "Retrait d'un parent",
  "enrollment.create": "Inscription", "enrollment.end": "Fin d'inscription",
};
