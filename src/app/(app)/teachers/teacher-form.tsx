import type { Teacher } from "@prisma/client";
import { Form, Input, Select, Submit, Checkbox, Textarea } from "@/components/form";
import { db } from "@/server/db";
import { formatMoney, moneyInput } from "@/lib/format";
import { saveTeacher } from "./actions";

export function payLabel(t: Pick<Teacher, "payMode" | "payRate">) {
  if (t.payMode === "POURCENTAGE") return `${t.payRate} % des mensualités`;
  return `${formatMoney(t.payRate)} / ${t.payMode === "HORAIRE" ? "heure" : "mois"}`;
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Input label="Nom *" name="lastName" defaultValue={t?.lastName} />
        <Input label="Prénom *" name="firstName" defaultValue={t?.firstName} />
        <Input label="Téléphone *" name="phone" inputMode="tel" defaultValue={t?.phone} />
        <Input label="E-mail" name="email" type="email" defaultValue={t?.email ?? ""} />
        <Select label="Mode de rémunération" name="payMode" defaultValue={t?.payMode ?? "HORAIRE"}
          options={[{ value: "HORAIRE", label: "À l'heure" }, { value: "MENSUEL", label: "Mensuel fixe" }, { value: "POURCENTAGE", label: "% des mensualités" }]} />
        <Input label="Taux (DT ou %) *" name="payRate" inputMode="decimal" defaultValue={t ? (t.payMode === "POURCENTAGE" ? String(t.payRate) : moneyInput(t.payRate)) : ""} hint="DT par heure ou par mois, ou pourcentage" />
        <Textarea label="Notes" name="notes" defaultValue={t?.notes ?? ""} wrapperClass="sm:col-span-2" />
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-gray-700">Matières enseignées</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {subjects.map((s) => <Checkbox key={s.id} label={s.name} name="subjectIds" value={s.id} defaultChecked={chosenS.has(s.id)} />)}
        </div>
      </fieldset>
      <fieldset>
        <legend className="mb-2 text-sm font-medium text-gray-700">Niveaux (cycles) enseignés</legend>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {cycles.map((c) => <Checkbox key={c.id} label={c.name} name="cycleIds" value={c.id} defaultChecked={chosenC.has(c.id)} />)}
        </div>
      </fieldset>
      {t && <Checkbox label="Enseignant actif" name="active" defaultChecked={t.active} />}
      <Submit>{t ? "Enregistrer" : "Ajouter l'enseignant"}</Submit>
    </Form>
  );
}
