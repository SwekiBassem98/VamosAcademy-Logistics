import type { Student } from "@prisma/client";
import { Input, Select, Textarea } from "@/components/form";
import { dayInput } from "@/lib/format";

export const STATUS_LABEL = { PREINSCRIT: "Pré-inscrit", ACTIF: "Actif", SUSPENDU: "Suspendu", ARCHIVE: "Archivé" } as const;
export const STATUS_TONE = { PREINSCRIT: "blue", ACTIF: "green", SUSPENDU: "amber", ARCHIVE: "gray" } as const;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-4">
      <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand">{title}</legend>
      {children}
    </fieldset>
  );
}

export function StudentFields({ s, levels }: { s?: Student; levels: { value: string; label: string }[] }) {
  return (
    <div className="space-y-6">
      <Section title="Identité">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input label="Nom *" name="lastName" defaultValue={s?.lastName} required autoComplete="off" />
          <Input label="Prénom *" name="firstName" defaultValue={s?.firstName} required autoComplete="off" />
          <Input label="Nom complet en arabe" name="fullNameAr" dir="rtl" lang="ar" defaultValue={s?.fullNameAr ?? ""} />
          <Input label="Date de naissance" name="birthDate" type="date" defaultValue={dayInput(s?.birthDate)} />
          <Select label="Sexe" name="gender" placeholder="—" defaultValue={s?.gender ?? ""} options={[{ value: "M", label: "Garçon" }, { value: "F", label: "Fille" }]} />
          {s?.status === "ARCHIVE" ? <input type="hidden" name="status" value="ARCHIVE" /> : (
            <Select label="Statut du dossier" name="status" defaultValue={s?.status ?? "ACTIF"}
              options={(["PREINSCRIT", "ACTIF", "SUSPENDU"] as const).map((v) => ({ value: v, label: STATUS_LABEL[v] }))} />
          )}
        </div>
      </Section>
      <Section title="Scolarité">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Select label="Niveau scolaire" name="levelId" placeholder="—" defaultValue={s?.levelId ?? ""} options={levels} />
          <Input label="Classe à l'école" name="className" placeholder="ex. 9e B" defaultValue={s?.className ?? ""} />
          <Input label="Établissement fréquenté" name="school" defaultValue={s?.school ?? ""} />
        </div>
      </Section>
      <Section title="Coordonnées">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input label="Téléphone de l'élève" name="phone" inputMode="tel" placeholder="20 807 657" defaultValue={s?.phone ?? ""} />
          <Input label="Adresse" name="address" wrapperClass="lg:col-span-2" defaultValue={s?.address ?? ""} />
          <Textarea label="Remarques médicales / allergies" name="medicalNotes" defaultValue={s?.medicalNotes ?? ""} />
          <Textarea label="Remarques" name="notes" wrapperClass="lg:col-span-2" defaultValue={s?.notes ?? ""} />
        </div>
      </Section>
    </div>
  );
}

export async function levelOptions(db: typeof import("@/server/db").db) {
  const levels = await db.level.findMany({ include: { cycle: true }, orderBy: [{ cycle: { order: "asc" } }, { order: "asc" }] });
  return levels.map((l) => ({ value: l.id, label: `${l.cycle.name} — ${l.name}` }));
}
