import Link from "next/link";
import { ApplyButton, Badge, Callout, Card, Forbidden, PageHeader, Table, Td } from "@/components/ui";
import { Checkbox, Form, Input, Select, Submit } from "@/components/form";
import { ConfirmAction } from "@/components/confirm";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { can } from "@/lib/permissions";
import { resolveFee } from "@/lib/billing";
import { formatMoney } from "@/lib/format";
import { deleteFeeRule, saveDiscountType, saveFeeRule } from "../settings/actions";
import { applyGridToGroup, applyGridToYear } from "./actions";

export const metadata = { title: "Tarifs & réductions" };

export default async function Tarifs({ searchParams }: { searchParams: Promise<{ year?: string }> }) {
  const user = await pageUser("payments.read");
  if (!user) return <Forbidden />;
  const manage = can(user.role, "settings.manage");
  const sp = await searchParams;
  const years = await db.schoolYear.findMany({ orderBy: { label: "desc" } });
  const year = years.find((y) => y.id === sp.year) ?? years.find((y) => y.active) ?? years[0];
  const [rules, cycles, levels, subjects, discounts, groups, discounted] = await Promise.all([
    year ? db.feeRule.findMany({ where: { schoolYearId: year.id }, include: { cycle: true, level: { include: { cycle: true } }, subject: true } }) : [],
    db.cycle.findMany({ orderBy: { order: "asc" } }),
    db.level.findMany({ include: { cycle: true }, orderBy: [{ cycle: { order: "asc" } }, { order: "asc" }] }),
    db.subject.findMany({ orderBy: { name: "asc" } }),
    db.discountType.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { enrollments: true } } } }),
    year ? db.group.findMany({ where: { schoolYearId: year.id, active: true }, include: { level: true, subject: true }, orderBy: [{ subject: { name: "asc" } }, { name: "asc" }] }) : [],
    year ? db.enrollment.findMany({
      where: { status: "ACTIVE", discountPercent: { gt: 0 }, group: { schoolYearId: year.id } },
      include: { student: true, group: true, discountType: true }, orderBy: { student: { lastName: "asc" } }, take: 300,
    }) : [],
  ]);
  const specificity = (r: (typeof rules)[number]) => (r.levelId ? 4 : 0) + (r.subjectId ? 2 : 0) + (r.cycleId ? 1 : 0);
  const sorted = [...rules].sort((a, b) => specificity(a) - specificity(b));
  const rows = groups.map((g) => {
    const rule = resolveFee(rules, { cycleId: g.level.cycleId, levelId: g.levelId, subjectId: g.subjectId });
    const state = !rule ? "none" : rule.monthlyFee === g.monthlyFee && rule.registrationFee === g.registrationFee ? "ok" : "custom";
    return { g, rule, state };
  });
  const customCount = rows.filter((r) => r.state === "custom").length;

  return (
    <>
      <PageHeader title="Tarifs & réductions" subtitle="Du tarif de la grille au montant payé par chaque famille."
        actions={<form className="flex gap-1.5"><select name="year" defaultValue={year?.id} className="input w-36" aria-label="Année">{years.map((y) => <option key={y.id} value={y.id}>{y.label}</option>)}</select><ApplyButton>OK</ApplyButton></form>} />
      <Callout tone="info" title="Comment le prix est déterminé" className="mb-6">
        <ol className="list-decimal space-y-0.5 pl-5">
          <li>La <strong>grille</strong> fixe un tarif par niveau, matière ou cycle.</li>
          <li>Chaque <strong>groupe</strong> reçoit ce tarif à sa création (ou un tarif personnalisé).</li>
          <li>À l&apos;<strong>inscription</strong>, une réduction autorisée peut s&apos;appliquer : la mensualité nette et les échéances sont alors calculées.</li>
        </ol>
        <p className="mt-1">Changer un tarif ne modifie jamais une inscription existante ; pour cela, ouvrez le dossier de l&apos;élève (« Modifier le tarif ou l&apos;échéancier »).</p>
      </Callout>

      <div className="space-y-6">
        <Card title={`1. Grille tarifaire — ${year?.label ?? "—"}`} description="La règle la plus précise l'emporte : niveau + matière › niveau › cycle + matière › matière › cycle › tarif par défaut.">
          <Table head={["Portée", "Mensualité", "Frais d'inscription", ""]} empty={sorted.length === 0} emptyText="Aucun tarif dans la grille." caption="Grille tarifaire">
            {sorted.map((r) => (
              <tr key={r.id}>
                <Td cell="primary" className="font-semibold lg:whitespace-normal">
                  {[r.level ? `${r.level.cycle.name} — ${r.level.name}` : r.cycle?.name, r.subject?.name].filter(Boolean).join(" · ") || <em className="text-muted">Tarif par défaut de l&apos;année</em>}
                </Td>
                <Td cell="num" className="font-semibold">{formatMoney(r.monthlyFee)}</Td>
                <Td cell="num">{formatMoney(r.registrationFee)}</Td>
                <Td cell="actions">{manage && <ConfirmAction action={deleteFeeRule.bind(null, r.id)} small variant="secondary" label="Retirer" title="Retirer ce tarif de la grille ?" message="Les groupes déjà créés gardent leur tarif." />}</Td>
              </tr>
            ))}
          </Table>
          {manage && year && (
            <Form action={saveFeeRule} className="mt-4 grid items-end gap-3 border-t border-line pt-4 sm:grid-cols-3 lg:grid-cols-6" resetOnSuccess>
              <input type="hidden" name="schoolYearId" value={year.id} />
              <Select label="Cycle" name="cycleId" placeholder="Tous" options={cycles.map((c) => ({ value: c.id, label: c.name }))} />
              <Select label="Niveau" name="levelId" placeholder="Tous" options={levels.map((l) => ({ value: l.id, label: `${l.cycle.name} — ${l.name}` }))} />
              <Select label="Matière" name="subjectId" placeholder="Toutes" options={subjects.map((s) => ({ value: s.id, label: s.name }))} />
              <Input label="Mensualité (DT) *" name="monthlyFee" inputMode="decimal" placeholder="50,000" />
              <Input label="Inscription (DT)" name="registrationFee" inputMode="decimal" placeholder="0,000" />
              <Submit variant="secondary">Ajouter / remplacer</Submit>
            </Form>
          )}
        </Card>

        <Card title="2. Tarifs des groupes" description="Comparaison de chaque groupe avec la grille."
          actions={manage && year && customCount > 0 && <ConfirmAction action={applyGridToYear.bind(null, year.id)} small variant="secondary" label={`Tout aligner (${customCount})`} title={`Aligner ${customCount} groupe(s) sur la grille ?`} message="Les nouvelles inscriptions utiliseront le tarif de la grille. Les inscriptions existantes ne changent pas." confirmLabel="Aligner" />}>
          <Table head={["Groupe", "Tarif du groupe", "Grille", "État", ""]} empty={rows.length === 0} emptyText="Aucun groupe actif cette année." caption="Tarifs des groupes">
            {rows.map(({ g, rule, state }) => (
              <tr key={g.id}>
                <Td cell="primary">{can(user.role, "academics.read") ? <Link href={`/academics/groups/${g.id}`} className="font-semibold text-navy hover:text-brand">{g.name}</Link> : <span className="font-semibold">{g.name}</span>}<span className="block text-xs text-muted">{g.subject.name} · {g.level.name}</span></Td>
                <Td cell="num">{formatMoney(g.monthlyFee)}<span className="block text-xs text-muted">inscr. {formatMoney(g.registrationFee)}</span></Td>
                <Td cell="num">{rule ? <>{formatMoney(rule.monthlyFee)}<span className="block text-xs text-muted">inscr. {formatMoney(rule.registrationFee)}</span></> : "—"}</Td>
                <Td>{state === "ok" ? <Badge tone="green">conforme</Badge> : state === "custom" ? <Badge tone="amber">personnalisé</Badge> : <Badge>sans tarif</Badge>}</Td>
                <Td cell="actions">{manage && state === "custom" && <ConfirmAction action={applyGridToGroup.bind(null, g.id)} small variant="secondary" label="Aligner" ariaLabel={`Aligner ${g.name} sur la grille`} title={`Aligner ${g.name} sur la grille ?`} message="Les nouvelles inscriptions utiliseront ce tarif. Les inscriptions existantes ne changent pas." confirmLabel="Aligner" />}</Td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="3. Réductions autorisées" description="Seules ces réductions peuvent être appliquées à une inscription. Modifier un pourcentage ne change pas les inscriptions existantes.">
          {discounts.length === 0 && <p className="text-sm text-muted">Aucune réduction configurée.</p>}
          <ul className="space-y-2">
            {discounts.map((d) => (
              <li key={d.id} className="rounded-md border border-line px-3 py-1">
                {manage ? (
                  <details>
                    <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 text-sm">
                      <span>{d.name} <span className="font-semibold text-brand">−{d.percent} %</span> {!d.active && <Badge>désactivée</Badge>}</span>
                      <span className="shrink-0 text-xs text-muted">{d._count.enrollments} inscription(s) · <span className="font-semibold text-brand">Modifier</span></span>
                    </summary>
                    <Form action={saveDiscountType.bind(null, d.id)} className="mt-2 grid grid-cols-2 items-end gap-2 pb-2 sm:grid-cols-4">
                      <Input label="Nom" name="name" defaultValue={d.name} />
                      <Input label="Pourcentage" name="percent" type="number" min={1} max={100} defaultValue={d.percent} />
                      <Checkbox label="Active" name="active" defaultChecked={d.active} />
                      <Submit variant="secondary">Enregistrer</Submit>
                    </Form>
                  </details>
                ) : (
                  <p className="flex min-h-11 items-center justify-between gap-2 text-sm"><span>{d.name} <span className="font-semibold text-brand">−{d.percent} %</span> {!d.active && <Badge>désactivée</Badge>}</span><span className="text-xs text-muted">{d._count.enrollments} inscription(s)</span></p>
                )}
              </li>
            ))}
          </ul>
          {manage && (
            <Form action={saveDiscountType.bind(null, null)} className="mt-4 grid grid-cols-[1fr_5.5rem] items-end gap-2 border-t border-line pt-4 sm:grid-cols-[1fr_6rem_auto]" resetOnSuccess>
              <Input label="Nouvelle réduction" name="name" placeholder="ex. Fratrie" />
              <Input label="%" name="percent" type="number" min={1} max={100} />
              <Submit variant="secondary">Ajouter</Submit>
            </Form>
          )}
        </Card>

        <Card title={`4. Réductions en cours (${discounted.length})`} description="Inscriptions actives bénéficiant d'une réduction cette année.">
          <Table head={["Élève", "Groupe", "Réduction", "Base", "Mensualité", "Justification"]} empty={discounted.length === 0} emptyText="Aucune réduction en cours." caption="Réductions en cours">
            {discounted.map((e) => (
              <tr key={e.id}>
                <Td cell="primary"><Link href={`/students/${e.studentId}`} className="font-semibold text-navy hover:text-brand">{e.student.lastName} {e.student.firstName}</Link></Td>
                <Td>{e.group.name}</Td>
                <Td>{e.discountType?.name ?? "Réduction"} −{e.discountPercent} %</Td>
                <Td cell="num">{formatMoney(e.baseFee)}</Td>
                <Td cell="num" className="font-semibold">{formatMoney(e.monthlyFee)}</Td>
                <Td cell="wide" className="text-xs">{e.discountNote ?? ""}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </>
  );
}
