import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { groupScope } from "@/server/scope";
import { can, type Permission } from "@/lib/permissions";
import { todayISO } from "@/lib/format";
import { levelOptions } from "../students/student-fields";

export const metadata = { title: "Documents" };

function Doc({ title, text, children }: { title: string; text: string; children: React.ReactNode }) {
  return (
    <Card title={title}>
      <p className="mb-3 text-sm text-muted">{text}</p>
      {children}
    </Card>
  );
}

export default async function Documents() {
  const user = await requireUser();
  const has = (p: Permission) => can(user.role, p);
  const [groups, levels, teachers] = await Promise.all([
    db.group.findMany({ where: { active: true, schoolYear: { active: true }, ...groupScope(user) }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    levelOptions(db),
    has("teachers.read") ? db.teacher.findMany({ where: { active: true }, orderBy: { lastName: "asc" } }) : [],
  ]);
  const month = todayISO().slice(0, 7);
  const groupSelect = <select name="group" required className="input" aria-label="Groupe"><option value="">Choisir un groupe…</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>;
  const btn = <button className="rounded-md bg-navy px-4 py-2 text-sm font-medium text-white">Générer</button>;

  return (
    <>
      <PageHeader title="Documents à imprimer" subtitle="Tous les documents portent l'identité officielle de VAMOS ACADEMY et la date d'édition (heure de Tunis). Utilisez « Imprimer » puis « Enregistrer au format PDF » si besoin." />
      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {has("students.read") && (
          <Doc title="Liste d'élèves par groupe" text="Liste nominative avec matricule et téléphone du parent ; export Excel disponible.">
            <form action="/documents/group-list" className="flex gap-2">{groupSelect}{btn}</form>
          </Doc>
        )}
        {has("students.read") && (
          <Doc title="Liste d'élèves par niveau" text="Tous les élèves actifs d'un niveau scolaire (classe), avec leurs groupes.">
            <form action="/documents/level-list" className="flex gap-2">
              <select name="level" required className="input" aria-label="Niveau"><option value="">Choisir un niveau…</option>{levels.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select>{btn}
            </form>
          </Doc>
        )}
        {has("attendance.read") && (
          <Doc title="Feuille de présence" text="Grille du mois (élèves × séances prévues) : vierge pour l'appel papier, ou remplie avec les appels enregistrés.">
            <form action="/documents/attendance-sheet" className="grid gap-2">
              {groupSelect}
              <div className="flex gap-2"><input type="month" name="month" defaultValue={month} className="input" aria-label="Mois" />
                <select name="mode" className="input" aria-label="Type"><option value="filled">Remplie</option><option value="blank">Vierge</option></select>{btn}</div>
            </form>
          </Doc>
        )}
        {has("academics.read") && (
          <Doc title="Emploi du temps" text="Grille hebdomadaire imprimable : tout le centre, par enseignant ou par salle.">
            <form action="/schedule" className="flex flex-wrap gap-2">
              {teachers.length > 0 && <select name="teacher" className="input w-auto" aria-label="Enseignant"><option value="">Tout le centre</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.lastName} {t.firstName}</option>)}</select>}
              <input type="hidden" name="print" value="1" />{btn}
            </form>
          </Doc>
        )}
        {has("grades.read") && (
          <Doc title="Synthèse pédagogique" text="Par groupe : moyenne de chaque élève, assiduité, absences et dernière appréciation, pour un trimestre ou l'année.">
            <form action="/documents/pedagogy" className="grid gap-2">
              {groupSelect}
              <div className="flex gap-2"><select name="term" className="input" aria-label="Trimestre"><option value="">Toute l&apos;année</option><option value="1">Trimestre 1</option><option value="2">Trimestre 2</option><option value="3">Trimestre 3</option></select>{btn}</div>
            </form>
          </Doc>
        )}
        {has("students.read") && (
          <Doc title="Fiche d'inscription / bulletin" text="Depuis le dossier de l'élève : « Fiche d'inscription » (administration), « Bulletin » et « Relevé de compte » (finances).">
            <Link href="/students" className="text-sm text-brand">Ouvrir la liste des élèves →</Link>
          </Doc>
        )}
        {has("payments.read") && (
          <Doc title="Reçus & état des impayés" text="Chaque reçu est imprimable et téléchargeable en PDF ; l'état des impayés s'imprime et s'exporte (CSV, Excel).">
            <div className="flex gap-4 text-sm"><Link href="/payments" className="text-brand">Paiements →</Link><Link href="/unpaid" className="text-brand">Impayés →</Link></div>
          </Doc>
        )}
        {has("reports.read") && (
          <Doc title="Rapports financiers" text="Rapport mensuel ou annuel (recettes, dépenses, rémunérations, résultat, impayés), imprimable et exportable.">
            <form action="/reports" className="flex gap-2"><input type="month" name="month" defaultValue={month} className="input" aria-label="Mois" />{btn}</form>
            <Link href="/reports" className="mt-2 inline-block text-sm text-brand">Rapport de l&apos;année scolaire →</Link>
          </Doc>
        )}
        {has("expenses.read") && (
          <Doc title="Fiches de rémunération" text="Fiche par enseignant et par mois, avec le détail des séances.">
            <Link href="/payroll" className="text-sm text-brand">Rémunérations →</Link>
          </Doc>
        )}
      </div>
    </>
  );
}
