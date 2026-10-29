"use client";

import { useState } from "react";
import { Form, FormActions, Input, Select, Submit, Textarea } from "@/components/form";
import { createPayment } from "../actions";
import { formatMoney, moneyInput } from "@/lib/format";

export type OpenInv = { id: string; label: string; due: string; remaining: number; late: boolean };

export function PaymentForm({ studentId, invoices, today, modes }: { studentId: string; invoices: OpenInv[]; today: string; modes: { value: string; label: string }[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(invoices.filter((i) => i.late).map((i) => i.id)));
  const total = invoices.filter((i) => selected.has(i.id)).reduce((s, i) => s + i.remaining, 0);
  const [amount, setAmount] = useState(moneyInput(total));

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
    setAmount(moneyInput(invoices.filter((i) => next.has(i.id)).reduce((s, i) => s + i.remaining, 0)));
  }

  return (
    <Form action={createPayment} className="space-y-5">
      <input type="hidden" name="studentId" value={studentId} />
      <fieldset>
        <legend className="mb-2 text-sm font-bold text-navy">Échéances à régler</legend>
        <div className="divide-y divide-line overflow-hidden rounded-md border border-line">
          {invoices.map((i) => (
            <label key={i.id} className="flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2.5 text-sm transition hover:bg-surface has-[:checked]:bg-brand-50/60">
              <input type="checkbox" name="invoiceIds" value={i.id} checked={selected.has(i.id)} onChange={() => toggle(i.id)} className="size-5 shrink-0 accent-brand" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium capitalize">{i.label}</span>
                <span className={i.late ? "text-xs font-semibold text-brand" : "text-xs text-muted"}>{i.late ? "En retard · " : ""}échéance {i.due}</span>
              </span>
              <span className="text-right font-bold tabular-nums text-navy">{formatMoney(i.remaining)}</span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">Sans sélection, le montant est affecté automatiquement aux échéances les plus anciennes. Un paiement partiel est accepté : le reste demeure dû.</p>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Montant (DT) *" name="amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Select label="Moyen de paiement *" name="modeId" options={modes} />
        <Input label="Date *" name="paidAt" type="date" defaultValue={today} max={today} />
        <Input label="Référence (n° chèque…)" name="reference" />
      </div>
      <Textarea label="Note" name="note" />
      <FormActions sticky>
        <p className="mr-auto text-sm" aria-live="polite">Sélection : <strong className="tabular-nums text-navy">{formatMoney(total)}</strong></p>
        <Submit>Valider et imprimer le reçu</Submit>
      </FormActions>
    </Form>
  );
}
