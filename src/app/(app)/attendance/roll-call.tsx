"use client";

import { useState } from "react";
import { Form, Input, Submit } from "@/components/form";
import { ATTENDANCE_LABEL } from "@/lib/labels";
import type { ActionState } from "@/components/form";

type Status = keyof typeof ATTENDANCE_LABEL;
type Row = { id: string; name: string; status: Status; note: string };

/** Feuille d'appel : statut par élève, motif/justificatif si non présent. */
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
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        <span className="text-muted">{(Object.keys(ATTENDANCE_LABEL) as Status[]).map((s) => `${ATTENDANCE_LABEL[s]} : ${counts[s] ?? 0}`).join(" · ")}</span>
        <button type="button" className="text-brand hover:underline" onClick={() => setStatuses(Object.fromEntries(rows.map((r) => [r.id, "PRESENT"])))}>Tous présents</button>
      </div>
      <ul className="divide-y divide-line rounded-md border border-line">
        {rows.map((r) => (
          <li key={r.id} className="px-3 py-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium">{r.name}</span>
              <div className="flex gap-1" role="radiogroup" aria-label={`Présence de ${r.name}`}>
                {(Object.keys(ATTENDANCE_LABEL) as Status[]).map((st) => (
                  <label key={st} className="cursor-pointer">
                    <input type="radio" name={`s_${r.id}`} value={st} checked={statuses[r.id] === st} onChange={() => setStatuses({ ...statuses, [r.id]: st })} className="peer sr-only" />
                    <span className="inline-block rounded-md border border-line px-2.5 py-1 text-xs peer-checked:border-navy peer-checked:bg-navy peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand">
                      {ATTENDANCE_LABEL[st]}
                    </span>
                  </label>
                ))}
              </div>
            </div>
            {statuses[r.id] !== "PRESENT" && (
              <input name={`n_${r.id}`} defaultValue={r.note} placeholder={statuses[r.id] === "EXCUSE" ? "Justificatif (certificat médical, mot du parent…)" : "Motif / remarque (facultatif)"}
                className="input mt-2 py-1 text-xs" aria-label={`Motif pour ${r.name}`} />
            )}
          </li>
        ))}
      </ul>
      <Submit>{isUpdate ? "Mettre à jour l'appel" : "Enregistrer l'appel"}</Submit>
    </Form>
  );
}
