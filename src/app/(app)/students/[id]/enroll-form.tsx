"use client";

import { useEffect, useRef, useState } from "react";
import { Checkbox, Form, Input, Select, Submit, type ActionState } from "@/components/form";
import { PLAN_LABEL, applyDiscount, billableMonths, planInvoices, type Plan } from "@/lib/billing";
import { formatMoney } from "@/lib/format";

type GroupOption = { id: string; label: string; monthlyFee: number; registrationFee: number };
type DiscountOption = { id: string; name: string; percent: number };
type Choice = { groupId: string; discountTypeId: string; plan: Plan; startDate: string; chargeRegistration: boolean };

/** Inscription avec aperçu du prix : le serveur recalcule tout, l'aperçu n'est qu'une aide à la décision. */
export function EnrollForm({ action, groups, discounts, yearLabel, billingMonths, dueDay, today }: {
  action: (state: ActionState, fd: FormData) => Promise<ActionState>;
  groups: GroupOption[];
  discounts: DiscountOption[];
  yearLabel: string;
  billingMonths: string[];
  dueDay: number;
  today: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const initial: Choice = { groupId: "", discountTypeId: "", plan: "MENSUEL", startDate: today, chargeRegistration: true };
  const [c, setC] = useState<Choice>(initial);
  const read = () => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const fd = new FormData(form);
    setC({
      groupId: String(fd.get("groupId") ?? ""), discountTypeId: String(fd.get("discountTypeId") ?? ""), plan: String(fd.get("plan") ?? "MENSUEL") as Plan,
      startDate: String(fd.get("startDate") ?? ""), chargeRegistration: fd.get("chargeRegistration") === "on",
    });
  };
  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const onReset = () => setTimeout(read);
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);

  const group = groups.find((g) => g.id === c.groupId);
  const discount = discounts.find((d) => d.id === c.discountTypeId);
  const net = group ? applyDiscount(group.monthlyFee, { percent: discount?.percent }) : 0;
  const plan = group ? planInvoices(billableMonths(billingMonths, c.startDate.slice(0, 7)), c.plan, net, dueDay) : [];
  const registration = group && c.chargeRegistration ? group.registrationFee : 0;
  const total = plan.reduce((s, i) => s + i.amount, 0) + registration;

  return (
    <Form action={action} className="mt-5 rounded-lg border border-navy-100 bg-navy-50/50 p-3 sm:p-4" resetOnSuccess>
      <div ref={ref} onChange={read} className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <p className="text-sm font-bold text-navy sm:col-span-2 xl:col-span-4">Nouvelle inscription — année {yearLabel}</p>
        <Select label="Groupe (matière · niveau) *" name="groupId" placeholder={groups.length ? "Choisir…" : "Aucun groupe disponible"} wrapperClass="sm:col-span-2"
          options={groups.map((g) => ({ value: g.id, label: g.label }))} />
        <Input label="Date d'entrée *" name="startDate" type="date" defaultValue={today} />
        <Select label="Échéancier" name="plan" options={Object.entries(PLAN_LABEL).map(([value, label]) => ({ value, label }))} />
        <Select label="Réduction autorisée" name="discountTypeId" placeholder="Aucune" options={discounts.map((d) => ({ value: d.id, label: `${d.name} (−${d.percent} %)` }))} />
        <Input label="Justification de la réduction" name="discountNote" wrapperClass="sm:col-span-2 xl:col-span-3" placeholder="ex. frère inscrit : VA-2026-0012" />
        <Checkbox label="Facturer les frais d'inscription du groupe" name="chargeRegistration" defaultChecked className="sm:col-span-2 xl:col-span-3" />
        <Submit className="max-sm:w-full">Inscrire</Submit>
        {group && (
          <dl aria-live="polite" data-testid="enroll-preview" className="grid gap-x-6 gap-y-1 rounded-md border border-line bg-white p-3 text-sm sm:col-span-2 sm:grid-cols-2 xl:col-span-4">
            <div className="flex justify-between gap-2"><dt className="text-muted">Tarif du groupe</dt><dd>{formatMoney(group.monthlyFee)} / mois</dd></div>
            {discount && <div className="flex justify-between gap-2"><dt className="text-muted">{discount.name} (−{discount.percent} %)</dt><dd>−{formatMoney(group.monthlyFee - net)}</dd></div>}
            <div className="flex justify-between gap-2"><dt className="font-semibold">Mensualité à payer</dt><dd className="font-bold text-brand">{formatMoney(net)}</dd></div>
            {registration > 0 && <div className="flex justify-between gap-2"><dt className="text-muted">Frais d&apos;inscription</dt><dd>{formatMoney(registration)}</dd></div>}
            <div className="flex justify-between gap-2"><dt className="text-muted">{plan.length} échéance(s)</dt><dd>{plan[0] ? `${formatMoney(plan[0].amount)} la première` : "aucun mois facturable"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="font-semibold">Total de l&apos;année</dt><dd className="font-semibold">{formatMoney(total)}</dd></div>
          </dl>
        )}
      </div>
    </Form>
  );
}
