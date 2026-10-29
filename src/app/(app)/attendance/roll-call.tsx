"use client";

import { useState } from "react";
import clsx from "clsx";
import { CheckCheck } from "lucide-react";
import { Form, FormActions, Input, Submit } from "@/components/form";
import { Button } from "@/components/ui";
import { ATTENDANCE_LABEL } from "@/lib/labels";
import type { ActionState } from "@/components/form";

type Status = keyof typeof ATTENDANCE_LABEL;
type Row = { id: string; name: string; status: Status; note: string };

// État sélectionné : couleur + libellé (jamais la couleur seule)
const ON: Record<Status, string> = {
  PRESENT: "peer-checked:border-success-600 peer-checked:bg-success-600 peer-checked:text-white",
  ABSENT: "peer-checked:border-danger-600 peer-checked:bg-danger-600 peer-checked:text-white",
  RETARD: "peer-checked:border-warning-600 peer-checked:bg-warning-600 peer-checked:text-white",
  EXCUSE: "peer-checked:border-info-600 peer-checked:bg-info-600 peer-checked:text-white",
};

/** Feuille d'appel : statut par élève (gros boutons au pouce), motif/justificatif si non présent, enregistrement toujours accessible. */
export function RollCall({ action, rows, topic, isUpdate }: {
  action: (prev: ActionState, fd: FormData) => Promise<ActionState>;
  rows: Row[];
  topic: string;
  isUpdate: boolean;
}) {
  const [statuses, setStatuses] = useState<Record<string, Status>>(Object.fromEntries(rows.map((r) => [r.id, r.status])));
  const counts = Object.values(statuses).reduce((c, s) => ({ ...c, [s]: (c[s] ?? 0) + 1 }), {} as Record<Status, number>);
  return (
    <Form action={action} className="space-y-4">
      <Input label="Thème de la séance" name="topic" defaultValue={topic} placeholder="ex. Équations du 2nd degré" />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted" aria-live="polite">
          {(Object.keys(ATTENDANCE_LABEL) as Status[]).map((s) => <span key={s}>{ATTENDANCE_LABEL[s]} : <strong className="text-ink">{counts[s] ?? 0}</strong></span>)}
        </p>
        <Button variant="secondary" size="sm" onClick={() => setStatuses(Object.fromEntries(rows.map((r) => [r.id, "PRESENT"])))}><CheckCheck /> Tous présents</Button>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-lg border border-line">
        {rows.map((r) => (
          <li key={r.id} className={clsx("px-3 py-3 transition", statuses[r.id] === "ABSENT" && "bg-danger-50/50")}>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm font-semibold text-ink">{r.name}</span>
              <div className="grid grid-cols-4 gap-1.5 sm:flex" role="radiogroup" aria-label={`Présence de ${r.name}`}>
                {(Object.keys(ATTENDANCE_LABEL) as Status[]).map((st) => (
                  <label key={st} className="cursor-pointer">
                    <input type="radio" name={`s_${r.id}`} value={st} checked={statuses[r.id] === st} onChange={() => setStatuses({ ...statuses, [r.id]: st })} className="peer sr-only" />
                    <span className={clsx("flex min-h-11 items-center justify-center rounded-md border border-line-strong bg-white px-2.5 text-xs font-semibold text-ink-soft transition select-none peer-focus-visible:ring-2 peer-focus-visible:ring-brand peer-focus-visible:ring-offset-1 pointer-fine:min-h-8", ON[st])}>
                      {ATTENDANCE_LABEL[st]}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            {statuses[r.id] !== "PRESENT" && (
              <input name={`n_${r.id}`} defaultValue={r.note} placeholder={statuses[r.id] === "EXCUSE" ? "Justificatif (certificat médical, mot du parent…)" : "Motif / remarque (facultatif)"}
                className="input mt-2" aria-label={`Motif pour ${r.name}`} />
            )}
          </li>
        ))}
      </ul>
      <FormActions sticky>
        <p className="mr-auto text-xs text-muted">{rows.length} élève(s) · {counts.ABSENT ?? 0} absent(s)</p>
        <Submit>{isUpdate ? "Mettre à jour l'appel" : "Enregistrer l'appel"}</Submit>
      </FormActions>
    </Form>
  );
}
