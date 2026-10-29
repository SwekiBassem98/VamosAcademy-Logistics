import { Card, PageHeader, Forbidden } from "@/components/ui";
import { Form, Input, Select, Submit, Checkbox } from "@/components/form";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { StudentFields, levelOptions } from "../student-fields";
import { createStudent } from "../actions";

export const metadata = { title: "Nouvel élève" };

export default async function NewStudent() {
  if (!(await pageUser("students.write"))) return <Forbidden />;
  return (
    <>
      <PageHeader title="Nouveau dossier élève" subtitle="Le matricule est attribué automatiquement. L'inscription aux groupes se fait ensuite depuis le dossier." />
      <Card>
        <Form action={createStudent} className="space-y-6">
          <StudentFields levels={await levelOptions(db)} />
          <fieldset className="space-y-4">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand">Parent / tuteur principal</legend>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Select label="Lien" name="parent_relation" options={["Père", "Mère", "Tuteur légal", "Autre"].map((v) => ({ value: v, label: v }))} />
              <Input label="Nom" name="parent_lastName" />
              <Input label="Prénom" name="parent_firstName" />
              <Input label="Téléphone" name="parent_phone" inputMode="tel" placeholder="98 123 456" />
            </div>
            <p className="text-xs text-muted">Facultatif ici ; d&apos;autres contacts (mère, urgence…) s&apos;ajoutent dans le dossier. Un téléphone déjà connu relie automatiquement le parent existant.</p>
          </fieldset>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
            <Checkbox label="Ce n'est pas un doublon (homonyme confirmé)" name="confirmNotDuplicate" />
            <Submit>Créer le dossier</Submit>
          </div>
        </Form>
      </Card>
    </>
  );
}
