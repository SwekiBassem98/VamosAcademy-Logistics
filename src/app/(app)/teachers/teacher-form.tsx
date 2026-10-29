import type { Teacher } from "@prisma/client";
import { Form, FormActions, Input, Select, Submit, Checkbox, Textarea } from "@/components/form";
import { db } from "@/server/db";
import { formatMoney, moneyInput } from "@/lib/format";
import { saveTeacher } from "./actions";

export function payLabel(t: Pick<Teacher, "payMode" | "payRate">) {
  if (t.payMode === "POURCENTAGE") return `${t.payRate} % des mensualités`;
  return `${formatMoney(t.payRate)} / ${t.payMode === "HORAIRE" ? "heure" : t.payMode === "PAR_SEANCE" ? "séance" : "mois"}`;
}

export async function TeacherForm({ t }: { t?: Teacher & { subjects: { subjectId: string }[]; cycles: { cycleId: string }[] } }) {
  const [subjects, cycles] = await Promise.all([
    db.subject.findMany({ orderBy: { name: "asc" } }),
    db.cycle.findMany({ orderBy: { order: "asc" } }),
  ]);
  const chosenS = new Set(t?.subjects.map((s) => s.subjectId));
  const chosenC = new Set(t?.cycles.map((c) => c.cycleId));
  return (
    <Form action={saveTeacher.bind(null, t?.id ?? null)} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Nom *" name="lastName" defaultValue={t?.lastName} />
        <Input label="Prénom *" name="firstName" defaultValue={t?.firstName} />
        <Input label="Téléphone *" name="phone" type="tel" inputMode="tel" autoComplete="off" defaultValue={t?.phone} />
        <Input label="E-mail" name="email" type="email" inputMode="email" defaultValue={t?.email ?? ""} />
        <Select label="Mode de rémunération" name="payMode" defaultValue={t?.payMode ?? "HORAIRE"}
          options={[{ value: "HORAIRE", label: "À l'heure" }, { value: "PAR_SEANCE", label: "Par séance" }, { value: "MENSUEL", label: "Forfait mensuel" }, { value: "POURCENTAGE", label: "% des mensualités encaissées" }]} />
        <Input label="Taux (DT ou %) *" name="payRate" inputMode="decimal" defaultValue={t ? (t.payMode === "POURCENTAGE" ? String(t.payRate) : moneyInput(t.payRate)) : ""} hint="DT par heure ou par mois, ou pourcentage" />
        <Textarea label="Notes" name="notes" defaultValue={t?.notes ?? ""} wrapperClass="sm:col-span-2" />
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-bold text-navy">Matières enseignées</legend>
        <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
          {subjects.map((s) => <Checkbox key={s.id} label={s.name} name="subjectIds" value={s.id} defaultChecked={chosenS.has(s.id)} />)}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-sm font-bold text-navy">Niveaux (cycles) enseignés</legend>
        <div className="grid grid-cols-2 gap-x-4 sm:grid-cols-3">
          {cycles.map((c) => <Checkbox key={c.id} label={c.name} name="cycleIds" value={c.id} defaultChecked={chosenC.has(c.id)} />)}
        </div>
      </fieldset>
      {t && <Checkbox label="Enseignant actif" name="active" defaultChecked={t.active} />}
      <FormActions><Submit>{t ? "Enregistrer" : "Ajouter l'enseignant"}</Submit></FormActions>
    </Form>
  );
}
