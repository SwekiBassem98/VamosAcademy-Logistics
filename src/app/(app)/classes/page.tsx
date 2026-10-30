import { redirect } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { teacherClasses } from "@/server/services/teacher";
import { ClassCard } from "./class-card";

export const metadata = { title: "Mes classes" };

/** Espace enseignant : ses groupes de l'année active. Les autres rôles gèrent les groupes dans « Groupes, salles & cours ». */
export default async function Classes() {
  const user = await requireUser();
  if (user.role !== "ENSEIGNANT") redirect("/academics");
  const classes = await teacherClasses(user);
  const students = classes.reduce((n, c) => n + c.students, 0);
  return (
    <>
      <PageHeader title="Mes classes" subtitle={classes.length ? `${classes.length} classe${classes.length > 1 ? "s" : ""} cette année · ${students} inscription${students > 1 ? "s" : ""}. Ouvrez une classe pour voir vos élèves, faire l'appel ou saisir des notes.` : undefined} />
      {!user.teacherId ? (
        <EmptyState title="Compte non relié à une fiche enseignant" text="Contactez l'administration du centre pour activer votre espace." />
      ) : classes.length === 0 ? (
        <EmptyState title="Aucune classe pour le moment" text="L'administration vous affectera vos groupes ; ils apparaîtront ici automatiquement." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">{classes.map((c) => <ClassCard key={c.id} c={c} />)}</div>
      )}
    </>
  );
}
