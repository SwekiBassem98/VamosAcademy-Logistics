import { Card, PageHeader, Forbidden } from "@/components/ui";
import { Form, FormActions, Input, Select, Submit, Checkbox } from "@/components/form";
import { pageUser } from "@/server/auth";
import { db } from "@/server/db";
import { StudentFields, Section, levelOptions } from "../student-fields";
import { createStudent } from "../actions";

export const metadata = { title: "Nouvel élève" };

export default async function NewStudent() {
  if (!(await pageUser("students.write"))) return <Forbidden />;
  return (
    <>
      <PageHeader back={{ href: "/students", label: "Élèves" }} title="Nouveau dossier élève"
        subtitle="Seuls le nom et le prénom sont obligatoires. Le matricule est attribué automatiquement ; l'inscription aux groupes se fait ensuite depuis le dossier." />
      <Card className="max-w-4xl">
        <Form action={createStudent} className="space-y-7">
          <StudentFields levels={await levelOptions(db)} />
          <Section title="Parent / tuteur principal" step={4} hint="Facultatif ici ; d'autres contacts (mère, urgence…) s'ajoutent dans le dossier. Un téléphone déjà connu relie automatiquement le parent existant.">
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Select label="Lien" name="parent_relation" options={["Père", "Mère", "Tuteur légal", "Autre"].map((v) => ({ value: v, label: v }))} />
              <Input label="Nom" name="parent_lastName" autoComplete="off" />
              <Input label="Prénom" name="parent_firstName" autoComplete="off" />
              <Input label="Téléphone" name="parent_phone" type="tel" inputMode="tel" placeholder="98 123 456" />
            </div>
          </Section>
          <FormActions sticky>
            <Checkbox label="Ce n'est pas un doublon (homonyme confirmé)" name="confirmNotDuplicate" className="mr-auto" />
            <Submit>Créer le dossier</Submit>
          </FormActions>
        </Form>
      </Card>
    </>
  );
}
