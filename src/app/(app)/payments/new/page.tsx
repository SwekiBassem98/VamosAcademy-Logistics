import Link from "next/link";
import { Card, PageHeader, Forbidden, Table, Td } from "@/components/ui";
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
        <PageHeader title="Encaisser un paiement" subtitle="Recherchez l'élève concerné." />
        <form className="mb-4 flex gap-2">
          <input name="q" defaultValue={q} autoFocus placeholder="Nom, matricule ou téléphone du parent" className="input max-w-md" aria-label="Rechercher un élève" />
          <button className="rounded-md bg-navy px-4 py-2 text-sm font-medium text-white">Rechercher</button>
        </form>
        {q && (
          <Table head={["Matricule", "Élève", "Niveau", ""]} empty={results.length === 0}>
            {results.map((s) => (
              <tr key={s.id}>
                <Td className="font-mono text-xs">{s.code}</Td>
                <Td className="font-medium">{s.lastName} {s.firstName}</Td>
                <Td>{s.level?.name ?? "—"}</Td>
                <Td><Link href={`/payments/new?student=${s.id}`} className="text-brand">Sélectionner →</Link></Td>
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
      <PageHeader title="Encaisser un paiement" subtitle={<>Élève : <Link className="text-brand" href={`/students/${student.id}`}>{student.lastName} {student.firstName}</Link> ({student.code})</>} />
      <Card>
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
        <p className="mt-4 text-xs text-muted">Total restant sur l&apos;année : {formatMoney(invoices.reduce((s, i) => s + i.remaining, 0))}</p>
      </Card>
    </>
  );
}
