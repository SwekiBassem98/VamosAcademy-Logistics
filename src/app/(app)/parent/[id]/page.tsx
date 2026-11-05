import { notFound } from "next/navigation";
import { Download } from "lucide-react";
import { Badge, Card, Forbidden, PageHeader, Stat, Table, Td, buttonClass } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { childrenOf } from "@/server/scope";
import { getActiveYear, studentInvoices } from "@/server/services/finance";
import { STATUS_LABEL as INV_LABEL } from "@/lib/billing";
import { WEEKDAYS, formatDate, formatMinutes, formatMoney, formatPeriod } from "@/lib/format";
import { KIND_LABEL, formatScore, weightedAverage } from "@/lib/grades";
import { ATTENDANCE_LABEL } from "@/lib/labels";

export const metadata = { title: "Suivi de mon enfant" };

const INV_TONE = { PAYEE: "green", PARTIELLE: "amber", IMPAYEE: "gray", EN_RETARD: "red" } as const;
const ATT_TONE = { PRESENT: "green", ABSENT: "red", RETARD: "amber", EXCUSE: "blue" } as const;

export default async function ParentChild({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  if (user.role !== "PARENT") return <Forbidden />;
  const { id } = await params;
  // Un enfant d'une autre famille répond « introuvable », comme un identifiant inexistant
  const s = await db.student.findFirst({ where: { id, ...childrenOf(user) }, include: { level: true } });
  if (!s) notFound();
  const year = await getActiveYear().catch(() => null);
  const [invoices, payments, enrollments, attendance, grades] = await Promise.all([
    studentInvoices(id, year?.id),
    db.payment.findMany({ where: { studentId: id, cancelledAt: null }, include: { mode: true }, orderBy: { paidAt: "desc" } }),
    db.enrollment.findMany({
      where: { studentId: id, status: "ACTIVE", ...(year ? { group: { schoolYearId: year.id } } : {}) },
      include: { group: { include: { subject: true, teacher: true, slots: { include: { room: true }, orderBy: [{ weekday: "asc" }, { startMin: "asc" }] } } } },
    }),
    db.attendanceRecord.findMany({ where: { studentId: id }, include: { session: { include: { group: { include: { subject: true } } } } }, orderBy: { session: { date: "desc" } }, take: 30 }),
    db.grade.findMany({ where: { studentId: id, ...(year ? { assessment: { group: { schoolYearId: year.id } } } : {}) }, include: { assessment: { include: { group: { include: { subject: true } } } } }, orderBy: { assessment: { date: "desc" } } }),
  ]);
  const remaining = invoices.reduce((t, i) => t + i.remaining, 0);
  const paid = invoices.reduce((t, i) => t + i.paid, 0);
  const absences = attendance.filter((a) => a.status === "ABSENT").length;
  const avg = weightedAverage(grades.map((g) => ({ score: g.score, maxScore: g.assessment.maxScore, coefficient: g.assessment.coefficient })));
  const slots = enrollments.flatMap((e) => e.group.slots.map((slot) => ({ slot, group: e.group })))
    .sort((a, b) => a.slot.weekday - b.slot.weekday || a.slot.startMin - b.slot.startMin);

  return (
    <>
      <PageHeader back={{ href: "/parent", label: "Mes enfants" }} title={`${s.firstName} ${s.lastName}`}
        subtitle={`${s.code} · ${s.level?.name ?? "Niveau non renseigné"}${year ? ` · ${year.label}` : ""}`} />
      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <Stat label="Reste à payer" tone={remaining ? "brand" : "navy"} value={formatMoney(remaining)} />
        <Stat label="Déjà payé" tone="green" value={formatMoney(paid)} />
        <Stat label="Absences récentes" value={String(absences)} hint={`sur ${attendance.length} séance(s)`} />
        <Stat label="Moyenne (année)" value={avg == null ? "—" : `${formatScore(avg)} / 20`} hint={`${grades.length} note(s)`} />
      </div>
      <div className="space-y-6">
        <Card title="Emploi du temps">
          <Table head={["Jour", "Horaire", "Matière", "Enseignant", "Salle"]} empty={slots.length === 0} emptyText="Aucun cours planifié.">
            {slots.map(({ slot, group }) => (
              <tr key={slot.id}>
                <Td cell="primary" className="font-semibold">{WEEKDAYS[slot.weekday]}</Td>
                <Td>{formatMinutes(slot.startMin)} – {formatMinutes(slot.endMin)}</Td>
                <Td>{group.subject.name}</Td>
                <Td>{group.teacher ? `${group.teacher.firstName} ${group.teacher.lastName}` : "—"}</Td>
                <Td>{slot.room.name}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Échéances">
          <Table head={["Période", "Matière", "Échéance", "Montant", "Payé", "Reste", "Statut"]} empty={invoices.length === 0} emptyText="Aucune échéance cette année.">
            {invoices.map((i) => (
              <tr key={i.id}>
                <Td cell="primary" className="font-semibold capitalize">{i.kind === "INSCRIPTION" ? "Inscription" : formatPeriod(i.period)}</Td>
                <Td>{i.enrollment.group.subject.name}</Td>
                <Td>{formatDate(i.dueDate)}</Td>
                <Td cell="num">{formatMoney(i.amount)}</Td>
                <Td cell="num">{formatMoney(i.paid)}</Td>
                <Td cell="num" className="font-semibold">{formatMoney(i.remaining)}</Td>
                <Td><Badge tone={INV_TONE[i.status]}>{INV_LABEL[i.status]}</Badge></Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Paiements et reçus">
          <Table head={["Reçu", "Date", "Mode", "Montant", ""]} empty={payments.length === 0} emptyText="Aucun paiement enregistré.">
            {payments.map((p) => (
              <tr key={p.id}>
                <Td cell="primary" className="font-mono text-sm">{p.receiptNo}</Td>
                <Td>{formatDate(p.paidAt)}</Td>
                <Td>{p.mode.label}</Td>
                <Td cell="num" className="font-semibold">{formatMoney(p.amount)}</Td>
                <Td cell="actions"><a href={`/api/receipts/${p.id}/pdf`} className={buttonClass({ variant: "secondary", size: "sm" })} aria-label={`Télécharger le reçu ${p.receiptNo}`}><Download /> Reçu</a></Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Présences" description="30 dernières séances">
          <Table head={["Date", "Matière", "Statut", "Remarque"]} empty={attendance.length === 0} emptyText="Aucune séance pointée.">
            {attendance.map((a) => (
              <tr key={a.id}>
                <Td cell="primary" className="font-semibold">{formatDate(a.session.date)}</Td>
                <Td>{a.session.group.subject.name}</Td>
                <Td><Badge tone={ATT_TONE[a.status]}>{ATTENDANCE_LABEL[a.status]}</Badge></Td>
                <Td cell="wide" className="text-xs">{a.note ?? ""}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Notes">
          <Table head={["Évaluation", "Date", "Matière", "Note", "Appréciation"]} empty={grades.length === 0} emptyText="Aucune note.">
            {grades.map((g) => (
              <tr key={g.id} className="align-top">
                <Td cell="primary"><span className="font-semibold">{g.assessment.title}</span><span className="block text-xs text-muted">{KIND_LABEL[g.assessment.kind]} · T{g.assessment.term}</span></Td>
                <Td>{formatDate(g.assessment.date)}</Td>
                <Td>{g.assessment.group.subject.name}</Td>
                <Td cell="num" className="font-semibold">{g.score == null ? "abs." : `${formatScore(g.score)} / ${g.assessment.maxScore}`}</Td>
                <Td cell="wide" className="text-xs">{g.comment ?? ""}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
