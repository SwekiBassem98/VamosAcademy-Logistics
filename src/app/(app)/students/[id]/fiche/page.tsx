import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Forbidden } from "@/components/ui";
import { PrintButton } from "@/components/print-button";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { studentScope } from "@/server/scope";
import { formatDate, formatMoney, formatDateTime, formatMinutes, WEEKDAYS } from "@/lib/format";

export const metadata = { title: "Fiche d'inscription" };

export default async function Fiche({ params }: { params: Promise<{ id: string }> }) {
  const user = await pageUser("students.write"); // document administratif complet (adresse, contacts)
  if (!user) return <Forbidden />;
  const { id } = await params;
  const [s, center, year] = await Promise.all([
    db.student.findFirst({
      where: { id, ...studentScope(user) },
      include: {
        level: { include: { cycle: true } },
        guardians: { include: { guardian: true }, orderBy: { isPayer: "desc" } },
        enrollments: {
          where: { status: "ACTIVE", group: { schoolYear: { active: true } } },
          include: { discountType: true, group: { include: { subject: true, teacher: true, slots: { include: { room: true }, orderBy: [{ weekday: "asc" }, { startMin: "asc" }] } } } },
        },
      },
    }),
    db.centerSettings.findUnique({ where: { id: 1 } }),
    db.schoolYear.findFirst({ where: { active: true } }),
  ]);
  if (!s) notFound();
  const totalMonthly = s.enrollments.reduce((t, e) => t + e.monthlyFee, 0);
  const regFees = s.enrollments.reduce((t, e) => t + e.group.registrationFee, 0);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="no-print mb-4 flex items-center justify-between">
        <Link href={`/students/${s.id}`} className="text-sm text-muted hover:text-brand">← Retour au dossier</Link>
        <PrintButton />
      </div>
      <article className="rounded-lg border border-line bg-white p-8 text-sm print:border-0 print:p-0">
        <header className="flex items-start justify-between gap-4 border-b-2 border-brand pb-4">
          <div>
            <Image src="/brand/logo.png" alt="VAMOS ACADEMY" width={150} height={79} />
            <p className="mt-2 text-xs text-muted">{center?.addressFr}<br /><span dir="rtl">{center?.addressAr}</span><br />Tél. {center?.phone}</p>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-bold text-navy">FICHE D&apos;INSCRIPTION</h1>
            <p className="text-sm">Année scolaire <strong>{year?.label ?? "—"}</strong></p>
            <p className="mt-2 inline-block rounded border-2 border-navy px-3 py-1 font-mono text-base font-bold text-navy">{s.code}</p>
          </div>
        </header>

        <h2 className="mt-5 mb-2 bg-navy px-2 py-1 text-xs font-bold uppercase tracking-wide text-white">Élève</h2>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5">
          <Row k="Nom et prénom" v={`${s.lastName} ${s.firstName}`} />
          <Row k="Nom en arabe" v={s.fullNameAr} rtl />
          <Row k="Date de naissance" v={formatDate(s.birthDate)} />
          <Row k="Sexe" v={s.gender === "M" ? "Garçon" : s.gender === "F" ? "Fille" : null} />
          <Row k="Niveau" v={s.level ? `${s.level.cycle.name} — ${s.level.name}` : null} />
          <Row k="Classe / établissement" v={[s.className, s.school].filter(Boolean).join(" — ")} />
          <Row k="Téléphone" v={s.phone} />
          <Row k="Adresse" v={s.address} />
          <Row k="Remarques médicales" v={s.medicalNotes} />
        </dl>

        <h2 className="mt-5 mb-2 bg-navy px-2 py-1 text-xs font-bold uppercase tracking-wide text-white">Parents / contacts</h2>
        {s.guardians.length === 0 ? <p className="text-muted">Aucun contact enregistré.</p> : (
          <table className="w-full">
            <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="py-1">Lien</th><th>Nom</th><th>Téléphone</th><th>Profession</th><th>Paiements</th></tr></thead>
            <tbody>{s.guardians.map(({ guardian: g, relation, isPayer }) => (
              <tr key={g.id} className="border-b border-line/60"><td className="py-1">{relation}</td><td>{g.lastName} {g.firstName}</td><td>{g.phone}{g.phone2 && ` / ${g.phone2}`}</td><td>{g.profession ?? ""}</td><td>{isPayer ? "Oui" : ""}</td></tr>
            ))}</tbody>
          </table>
        )}

        <h2 className="mt-5 mb-2 bg-navy px-2 py-1 text-xs font-bold uppercase tracking-wide text-white">Cours suivis</h2>
        {s.enrollments.length === 0 ? <p className="text-muted">Aucune inscription en cours pour cette année.</p> : (
          <table className="w-full">
            <thead><tr className="border-b border-line text-left text-xs text-muted"><th className="py-1">Matière / groupe</th><th>Horaires</th><th>Depuis</th><th className="text-right">Mensualité</th></tr></thead>
            <tbody>
              {s.enrollments.map((e) => (
                <tr key={e.id} className="border-b border-line/60 align-top">
                  <td className="py-1">{e.group.subject.name}<span className="block text-xs text-muted">{e.group.name}{e.group.teacher && ` — ${e.group.teacher.lastName}`}</span></td>
                  <td className="text-xs">{e.group.slots.map((sl) => <span key={sl.id} className="block">{WEEKDAYS[sl.weekday]} {formatMinutes(sl.startMin)}–{formatMinutes(sl.endMin)} ({sl.room.name})</span>)}</td>
                  <td>{formatDate(e.startDate)}</td>
                  <td className="text-right tabular-nums">{formatMoney(e.monthlyFee)}{e.discountPercent > 0 && <span className="block text-xs text-muted">{e.discountType?.name} −{e.discountPercent} %</span>}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr><td colSpan={3} className="pt-2 text-right font-semibold">Total mensuel</td><td className="pt-2 text-right font-bold text-brand tabular-nums">{formatMoney(totalMonthly)}</td></tr>
              {regFees > 0 && <tr><td colSpan={3} className="text-right text-xs text-muted">Frais d&apos;inscription (une fois)</td><td className="text-right text-xs tabular-nums">{formatMoney(regFees)}</td></tr>}
            </tfoot>
          </table>
        )}

        <h2 className="mt-5 mb-2 bg-navy px-2 py-1 text-xs font-bold uppercase tracking-wide text-white">Engagement</h2>
        <p className="text-xs leading-relaxed text-gray-700">
          Les mensualités sont payables avant le {year?.dueDay ?? 10} de chaque mois. Toute absence doit être signalée au centre.
          Le parent / tuteur certifie l&apos;exactitude des informations ci-dessus et autorise le centre à le contacter en cas d&apos;urgence.
        </p>
        <div className="mt-8 grid grid-cols-2 gap-10 text-center text-xs">
          <p className="h-20 border-t border-dashed border-gray-400 pt-1">Signature du parent / tuteur</p>
          <p className="h-20 border-t border-dashed border-gray-400 pt-1">Cachet & signature de VAMOS ACADEMY</p>
        </div>
        <p className="mt-4 text-right text-[10px] text-muted">Édité le {formatDateTime(new Date())}{s.isDemo && " — DONNÉE DE DÉMONSTRATION"}</p>
      </article>
    </div>
  );
}

function Row({ k, v, rtl }: { k: string; v: string | null | undefined; rtl?: boolean }) {
  return (
    <div className="flex gap-2 border-b border-dotted border-gray-300 py-0.5">
      <dt className="w-40 shrink-0 text-xs text-muted">{k}</dt>
      <dd className="font-medium" dir={rtl ? "rtl" : undefined}>{v || "—"}</dd>
    </div>
  );
}
