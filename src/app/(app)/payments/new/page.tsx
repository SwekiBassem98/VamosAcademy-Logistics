import Link from "next/link";
import { Card, PageHeader, Forbidden, Table, Td, ApplyButton, LinkButton, EmptyState } from "@/components/ui";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { studentInvoices } from "@/server/services/finance";
import { formatDate, formatMoney, formatPeriod, todayISO } from "@/lib/format";
import { PaymentForm } from "./payment-form";
import { paymentModes, modeOptions } from "@/server/modes";

export const metadata = { title: "Encaisser" };

export default async function NewPayment({ searchParams }: { searchParams: Promise<{ student?: string; q?: string }> }) {
  if (!(await pageUser("payments.write"))) return <Forbidden />;
  const { student: studentId, q = "" } = await searchParams;

  if (!studentId) {
    const results = q
      ? await db.student.findMany({
          where: { OR: [{ lastName: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } }, { code: { contains: q, mode: "insensitive" } }, { guardians: { some: { guardian: { phone: { contains: q } } } } }] },
          include: { level: true }, take: 20, orderBy: { lastName: "asc" },
        })
      : [];
    return (
      <>
        <PageHeader back={{ href: "/payments", label: "Paiements" }} title="Encaisser un paiement" subtitle="Étape 1 sur 2 — recherchez l'élève concerné." />
        <form className="mb-4 flex max-w-xl gap-2" role="search">
          <input name="q" type="search" enterKeyHint="search" defaultValue={q} autoFocus placeholder="Nom, matricule ou téléphone du parent" className="input" aria-label="Rechercher un élève" />
          <ApplyButton>Rechercher</ApplyButton>
        </form>
        {!q && <EmptyState title="Qui paie aujourd'hui ?" text="Saisissez le nom de l'élève, son matricule (VA-…) ou le téléphone d'un parent." />}
        {q && (
          <Table head={["Élève", "Matricule", "Niveau", ""]} empty={results.length === 0} emptyText="Aucun élève trouvé. Vérifiez l'orthographe ou cherchez par téléphone.">
            {results.map((s) => (
              <tr key={s.id}>
                <Td cell="primary" className="font-semibold text-navy">{s.lastName} {s.firstName}</Td>
                <Td className="font-mono text-xs">{s.code}</Td>
                <Td>{s.level?.name ?? "—"}</Td>
                <Td cell="actions" className="lg:text-right"><LinkButton size="sm" href={`/payments/new?student=${s.id}`} aria-label={`Sélectionner ${s.lastName} ${s.firstName}`}>Sélectionner</LinkButton></Td>
              </tr>
            ))}
          </Table>
        )}
      </>
    );
  }

  const student = await db.student.findUniqueOrThrow({ where: { id: studentId } });
  const year = await db.schoolYear.findFirst({ where: { active: true } });
  const invoices = (await studentInvoices(studentId, year?.id)).filter((i) => i.remaining > 0);
  return (
    <>
      <PageHeader back={{ href: "/payments/new", label: "Changer d'élève" }} title="Encaisser un paiement"
        subtitle={<>Étape 2 sur 2 · Élève : <Link className="font-semibold text-brand" href={`/students/${student.id}`}>{student.lastName} {student.firstName}</Link> ({student.code})</>} />
      <Card className="max-w-3xl">
        {invoices.length === 0 ? (
          <p className="text-sm text-muted">Aucune échéance à régler pour cet élève sur l&apos;année {year?.label}. Vérifiez ses inscriptions.</p>
        ) : (
          <PaymentForm
            modes={modeOptions(await paymentModes())}
            studentId={student.id}
            today={todayISO()}
            invoices={invoices.map((i) => ({
              id: i.id,
              label: `${formatPeriod(i.period)}${i.months > 1 ? ` (+${i.months - 1} mois)` : ""} — ${i.enrollment.group.name}`,
              due: formatDate(i.dueDate),
              remaining: i.remaining,
              late: i.status === "EN_RETARD",
            }))}
          />
        )}
        <p className="mt-4 text-sm text-muted">Total restant sur l&apos;année : {formatMoney(invoices.reduce((s, i) => s + i.remaining, 0))}</p>
      </Card>
    </>
  );
}
