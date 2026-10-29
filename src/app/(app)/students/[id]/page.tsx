import Link from "next/link";
import { notFound } from "next/navigation";
import { Printer } from "lucide-react";
import { Card, PageHeader, Table, Td, Badge, LinkButton, Forbidden, Stat, DemoBadge } from "@/components/ui";
import { Form, Input, Select, Submit, Checkbox } from "@/components/form";
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

  return (
    <>
      {created && <p role="status" className="mb-4 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">Dossier créé avec le matricule <strong>{s.code}</strong>. Vous pouvez maintenant l&apos;inscrire dans un groupe.</p>}
      <PageHeader
        title={`${s.lastName} ${s.firstName}`}
        subtitle={<span>{s.code} · {s.level ? `${s.level.cycle.name} — ${s.level.name}` : "Niveau non renseigné"}{s.className && ` · ${s.className}`}{s.fullNameAr && <span dir="rtl" className="ml-2">{s.fullNameAr}</span>}</span>}
        actions={<>
          {contacts && <LinkButton href={`/students/${s.id}/fiche`} variant="secondary"><Printer className="size-4" /> Fiche d&apos;inscription</LinkButton>}
          {can(user.role, "grades.read") && <LinkButton href={`/students/${s.id}/bulletin`} variant="secondary">Bulletin</LinkButton>}
          {finance && <LinkButton href={`/students/${s.id}/releve`} variant="secondary">Relevé de compte</LinkButton>}
          {finance && s.status !== "ARCHIVE" && can(user.role, "payments.write") && <LinkButton href={`/payments/new?student=${s.id}`}>Encaisser</LinkButton>}
          {can(user.role, "students.write") && (s.status === "ARCHIVE"
            ? <ConfirmAction action={restoreStudent.bind(null, s.id)} variant="secondary" label="Réactiver" title="Réactiver ce dossier ?" message="Le dossier repasse au statut actif. Les inscriptions terminées ne sont pas rouvertes." />
            : <ConfirmAction action={archiveStudent.bind(null, s.id)} label="Archiver" title="Archiver ce dossier ?" withReason="Motif"
                message="Les inscriptions en cours seront terminées aujourd'hui et les mensualités futures non payées retirées. L'historique (paiements, notes, présences) est conservé." confirmLabel="Archiver" />)}
        </>}
      />
      <div className="mb-6 flex flex-wrap gap-2">
        <Badge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}{s.archivedAt && ` le ${formatDate(s.archivedAt)}`}</Badge>
        {s.isDemo && <DemoBadge />}
        {s.medicalNotes && <Badge tone="amber">Remarque médicale</Badge>}
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {finance && <Stat label={`Reste à payer ${year?.label ?? ""}`} tone={overdue ? "brand" : "navy"} value={formatMoney(billed - paid)} hint={overdue ? `dont ${formatMoney(overdue)} en retard` : "aucun retard"} />}
        {finance && <Stat label="Déjà payé" tone="green" value={formatMoney(paid)} hint={`sur ${formatMoney(billed)} facturés`} />}
        {can(user.role, "attendance.read") && <Stat label="Assiduité" value={attendance.length ? `${Math.round((present / attendance.length) * 100)} %` : "—"} hint={`${attendance.filter((a) => a.status === "ABSENT").length} absence(s) sur ${attendance.length} séance(s)`} />}
        {can(user.role, "grades.read") && <Stat label="Moyenne (année)" value={avg == null ? "—" : `${formatScore(avg)} / 20`} hint={`${grades.length} note(s)`} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <Card title="Inscriptions — historique scolaire">
            <Table head={["Année", "Groupe", "Matière", "Entrée / sortie", "Tarif", "Statut", ""]} empty={s.enrollments.length === 0}>
              {s.enrollments.map((e) => (
                <tr key={e.id}>
                  <Td>{e.group.schoolYear.label}</Td>
                  <Td>{can(user.role, "academics.read") ? <Link className="font-medium hover:text-brand" href={`/academics/groups/${e.groupId}`}>{e.group.name}</Link> : <span className="font-medium">{e.group.name}</span>}<span className="block text-xs text-muted">{e.group.level.name}</span></Td>
                  <Td>{e.group.subject.name}</Td>
                  <Td className="text-xs">{formatDate(e.startDate)}{e.endDate && <> → {formatDate(e.endDate)}</>}</Td>
                  <Td className="tabular-nums">{formatMoney(e.monthlyFee)}
                    {e.discountPercent > 0 && <span className="block text-xs text-muted">{e.discountType?.name ?? "Réduction"} −{e.discountPercent} % (base {formatMoney(e.baseFee)})</span>}
                    <span className="block text-xs text-muted">{PLAN_LABEL[e.plan]}</span>
                  </Td>
                  <Td><Badge tone={e.status === "ACTIVE" ? "green" : "gray"}>{e.status === "ACTIVE" ? "en cours" : "terminée"}</Badge></Td>
                  <Td>{write && e.status === "ACTIVE" && (
                    <ConfirmAction action={endEnrollment.bind(null, e.id)} small label="Terminer" title={`Terminer l'inscription au groupe ${e.group.name} ?`}
                      message="Les mensualités postérieures à la date de sortie et non payées seront retirées.">
                      <label className="mt-4 block text-sm"><span className="font-medium text-gray-700">Date de sortie</span>
                        <input type="date" name="endDate" defaultValue={todayISO()} className="input mt-1" /></label>
                    </ConfirmAction>
                  )}</Td>
                </tr>
              ))}
            </Table>
            {write && can(user.role, "payments.write") && s.enrollments.some((e) => e.status === "ACTIVE") && (
              <details className="mt-3 border-t border-line pt-3">
                <summary className="cursor-pointer text-sm font-medium text-navy">Modifier le tarif ou l&apos;échéancier d&apos;une inscription</summary>
                <p className="mt-2 text-xs text-muted">Les échéances non payées à partir du mois indiqué sont annulées (motif tracé) puis recréées ; celles déjà réglées, même partiellement, sont conservées.</p>
                {s.enrollments.filter((e) => e.status === "ACTIVE").map((e) => (
                  <Form key={e.id} action={changeTerms.bind(null, e.id)} className="mt-3 grid items-end gap-3 rounded border border-line p-3 sm:grid-cols-2 lg:grid-cols-5">
                    <p className="text-sm font-medium sm:col-span-2 lg:col-span-5">{e.group.name}</p>
                    <Input label="Mensualité (DT)" name="monthlyFee" defaultValue={(e.monthlyFee / 1000).toFixed(3).replace(".", ",")} inputMode="decimal" />
                    <Select label="Échéancier" name="plan" defaultValue={e.plan} options={Object.entries(PLAN_LABEL).map(([value, label]) => ({ value, label }))} />
                    <Input label="À partir du mois" name="fromPeriod" type="month" defaultValue={todayISO().slice(0, 7)} />
                    <Input label="Motif *" name="reason" placeholder="ex. accord de la direction" />
                    <Submit variant="secondary">Appliquer</Submit>
                  </Form>
                ))}
              </details>
            )}
            {write && year && (
              <Form action={enrollStudent.bind(null, s.id)} className="mt-4 grid items-end gap-3 border-t border-line pt-4 sm:grid-cols-2 lg:grid-cols-4" resetOnSuccess>
                <p className="text-sm font-semibold text-navy sm:col-span-2 lg:col-span-4">Nouvelle inscription — année {year.label}</p>
                <Select label="Groupe (matière · niveau) *" name="groupId" placeholder={groups.length ? "Choisir…" : "Aucun groupe disponible"} wrapperClass="sm:col-span-2"
                  options={groups.map((g) => ({
                    value: g.id,
                    label: `${g.subject.name} · ${g.level.name} · ${g.name} — ${formatMoney(g.monthlyFee)}/mois${g._count.enrollments >= g.capacity ? " (COMPLET)" : ` (${g.capacity - g._count.enrollments} pl.)`}`,
                  }))} />
                <Input label="Date d'entrée *" name="startDate" type="date" defaultValue={todayISO()} />
                <Select label="Réduction autorisée" name="discountTypeId" placeholder="Aucune" options={discounts.map((d) => ({ value: d.id, label: `${d.name} (−${d.percent} %)` }))} />
                <Select label="Échéancier" name="plan" options={Object.entries(PLAN_LABEL).map(([value, label]) => ({ value, label }))} />
                <Input label="Justification de la réduction" name="discountNote" wrapperClass="sm:col-span-2" placeholder="ex. frère inscrit : VA-2026-0012" />
                <Checkbox label="Facturer les frais d'inscription du groupe" name="chargeRegistration" defaultChecked />
                <Submit>Inscrire</Submit>
              </Form>
            )}
          </Card>

          {finance && (
            <Card title={`Échéancier ${year?.label ?? ""}`} actions={<Link href={`/students/${s.id}/releve`} className="text-xs text-brand">Relevé de compte →</Link>}>
              <Table head={["Période", "Groupe", "Échéance", "Montant", "Payé", "Reste", "Statut"]} empty={invoices.length === 0}>
                {invoices.map((i) => (
                  <tr key={i.id}>
                    <Td className="capitalize">{formatPeriod(i.period)}{i.months > 1 && <span className="block text-xs normal-case text-muted">{i.months} mois</span>}</Td>
                    <Td>{i.enrollment.group.name}</Td>
                    <Td>{formatDate(i.dueDate)}</Td>
                    <Td className="tabular-nums">{formatMoney(i.amount)}</Td>
                    <Td className="tabular-nums">{formatMoney(i.paid)}</Td>
                    <Td className="tabular-nums font-medium">{formatMoney(i.remaining)}</Td>
                    <Td><Badge tone={INV_TONE[i.status]}>{INV_LABEL[i.status]}</Badge></Td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          {finance && (
            <Card title="Paiements — historique financier">
              <Table head={["Reçu", "Année", "Date", "Mode", "Montant", ""]} empty={payments.length === 0}>
                {payments.map((p) => (
                  <tr key={p.id} className={p.cancelledAt ? "text-muted" : ""}>
                    <Td className="font-mono text-xs">{p.receiptNo}</Td>
                    <Td>{p.schoolYear.label}</Td>
                    <Td>{formatDate(p.paidAt)}</Td>
                    <Td>{p.mode.label}</Td>
                    <Td className={p.cancelledAt ? "tabular-nums line-through" : "tabular-nums font-medium"}>{formatMoney(p.amount)}</Td>
                    <Td>{p.correctedBy ? <Link href={`/payments/${p.id}`}><Badge tone="amber">corrigé → {p.correctedBy.receiptNo}</Badge></Link> : p.cancelledAt ? <Link href={`/payments/${p.id}`}><Badge tone="red">annulé</Badge></Link> : <Link href={`/payments/${p.id}`} className="text-xs text-brand">Voir le reçu</Link>}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          {can(user.role, "grades.read") && (
            <Card title="Notes & appréciations">
              <Table head={["Date", "Groupe", "Évaluation", "Note", "Appréciation"]} empty={grades.length === 0}>
                {grades.map((g) => (
                  <tr key={g.id} className="align-top">
                    <Td>{formatDate(g.assessment.date)}</Td>
                    <Td>{g.assessment.group.subject.name}<span className="block text-xs text-muted">{g.assessment.group.schoolYear.label}</span></Td>
                    <Td>{g.assessment.title}<span className="block text-xs text-muted">{KIND_LABEL[g.assessment.kind]} · T{g.assessment.term} · coef. {g.assessment.coefficient}</span></Td>
                    <Td className="font-semibold tabular-nums">{g.score == null ? "abs." : `${formatScore(g.score)} / ${g.assessment.maxScore}`}</Td>
                    <Td className="whitespace-normal text-xs">{g.comment ?? ""}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          {can(user.role, "attendance.read") && (
            <Card title="Présences (40 dernières séances)">
              <Table head={["Date", "Groupe", "Statut", "Motif / justificatif"]} empty={attendance.length === 0}>
                {attendance.map((a) => (
                  <tr key={a.id}>
                    <Td>{formatDate(a.session.date)}</Td>
                    <Td>{a.session.group.name}</Td>
                    <Td><Badge tone={ATT_TONE[a.status]}>{ATTENDANCE_LABEL[a.status]}</Badge></Td>
                    <Td className="whitespace-normal text-xs">{a.note ?? ""}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          )}

          {history.length > 0 && (
            <Card title="Historique des modifications">
              <ol className="space-y-3 text-sm">
                {history.map((h) => {
                  const d = (h.details ?? {}) as { changes?: Change[]; reason?: string; group?: string };
                  return (
                    <li key={h.id} className="border-l-2 border-line pl-3">
                      <p><span className="font-medium text-navy">{ACTION_LABEL[h.action] ?? h.action}</span> <span className="text-xs text-muted">· {formatDateTime(h.createdAt)} · {h.user?.fullName ?? "Système"}</span></p>
                      {d.changes?.map((c) => <p key={c.field} className="text-xs text-gray-600">{FIELD_LABELS[c.field] ?? c.field} : <span className="line-through">{String(c.from ?? "—")}</span> → <strong>{String(c.to ?? "—")}</strong></p>)}
                      {d.group && <p className="text-xs text-gray-600">Groupe : {d.group}</p>}
                      {d.reason && <p className="text-xs text-gray-600">Motif : {d.reason}</p>}
                    </li>
                  );
                })}
              </ol>
            </Card>
          )}

          {write && (
            <Card title="Modifier le dossier">
              <Form action={updateStudent.bind(null, s.id)} className="space-y-6">
                <StudentFields s={s} levels={levels} />
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                  <Checkbox label="Homonyme confirmé (pas un doublon)" name="confirmNotDuplicate" />
                  <Submit />
                </div>
              </Form>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-6">
          <Card title="Parents & contacts d'urgence">
            {s.guardians.length === 0 && <p className="text-sm text-muted">Aucun parent enregistré.</p>}
            <ul className="space-y-3">
              {s.guardians.map(({ guardian: g, relation, isPayer }) => (
                <li key={g.id} className="rounded-md border border-line p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-medium text-navy">{g.lastName} {g.firstName}</p>
                    <Badge tone="blue">{relation}</Badge>
                  </div>
                  <p className="mt-1"><a href={`tel:${g.phone.replace(/\s/g, "")}`} className="hover:text-brand">{g.phone}</a>
                    {" · "}<a className="text-emerald-700" href={`https://wa.me/216${g.phone.replace(/\s/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a></p>
                  {g.phone2 && <p className="text-muted">{g.phone2}</p>}
                  {contacts && g.email && <p className="text-muted">{g.email}</p>}
                  {isPayer && <p className="mt-1 text-xs text-muted">Responsable des paiements</p>}
                  {write && (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs text-brand">Modifier</summary>
                      <Form action={updateGuardian.bind(null, s.id, g.id)} className="mt-2 space-y-2">
                        <Select label="Lien" name="relation" defaultValue={relation} options={RELATIONS} />
                        <div className="grid grid-cols-2 gap-2"><Input label="Nom *" name="lastName" defaultValue={g.lastName} /><Input label="Prénom *" name="firstName" defaultValue={g.firstName} /></div>
                        <Input label="Téléphone *" name="phone" defaultValue={g.phone} />
                        <Input label="Téléphone 2" name="phone2" defaultValue={g.phone2 ?? ""} />
                        <Input label="E-mail" name="email" type="email" defaultValue={g.email ?? ""} />
                        <Input label="Profession" name="profession" defaultValue={g.profession ?? ""} />
                        <Checkbox label="Responsable des paiements" name="isPayer" defaultChecked={isPayer} />
                        <div className="flex items-center justify-between gap-2">
                          <Submit variant="secondary">Enregistrer</Submit>
                        </div>
                      </Form>
                      <div className="mt-2"><ConfirmAction action={unlinkGuardian.bind(null, s.id, g.id)} small label="Retirer ce contact" title="Retirer ce contact du dossier ?" message="Le parent n'est pas supprimé s'il est relié à d'autres élèves." /></div>
                    </details>
                  )}
                </li>
              ))}
            </ul>
            {write && (
              <details className="mt-4 border-t border-line pt-4" open={s.guardians.length === 0}>
                <summary className="cursor-pointer text-sm font-medium text-navy">+ Ajouter un parent / contact</summary>
                <Form action={addGuardian.bind(null, s.id)} className="mt-3 space-y-3" resetOnSuccess>
                  <Select label="Lien" name="relation" options={RELATIONS} />
                  <div className="grid grid-cols-2 gap-3"><Input label="Nom *" name="lastName" /><Input label="Prénom *" name="firstName" /></div>
                  <Input label="Téléphone *" name="phone" inputMode="tel" placeholder="98 123 456" />
                  <Input label="Téléphone 2" name="phone2" inputMode="tel" />
                  <Input label="E-mail" name="email" type="email" />
                  <Input label="Profession" name="profession" />
                  <Checkbox label="Responsable des paiements" name="isPayer" />
                  <Submit variant="secondary">Ajouter</Submit>
                </Form>
              </details>
            )}
          </Card>
          <Card title="Informations">
            <dl className="grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-muted">Naissance</dt><dd>{formatDate(s.birthDate)}</dd>
              <dt className="text-muted">Sexe</dt><dd>{s.gender === "M" ? "Garçon" : s.gender === "F" ? "Fille" : "—"}</dd>
              <dt className="text-muted">Établissement</dt><dd>{s.school ?? "—"}</dd>
              {contacts && <><dt className="text-muted">Téléphone</dt><dd>{s.phone ?? "—"}</dd></>}
              {contacts && <><dt className="text-muted">Adresse</dt><dd>{s.address ?? "—"}</dd></>}
              <dt className="text-muted">Médical</dt><dd>{s.medicalNotes ?? "—"}</dd>
              <dt className="text-muted">Remarques</dt><dd>{s.notes ?? "—"}</dd>
              <dt className="text-muted">Dossier créé</dt><dd>{formatDate(s.createdAt)}</dd>
            </dl>
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
