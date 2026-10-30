import { CalendarDays, ClipboardList, FileSpreadsheet, HandCoins, NotebookPen, Receipt, Users, UsersRound, BarChart3 } from "lucide-react";
import { PageHeader, ApplyButton, CardLink } from "@/components/ui";
import { requireUser } from "@/server/auth";
import { db } from "@/server/db";
import { groupScope } from "@/server/scope";
import { can, type Permission } from "@/lib/permissions";
import { todayISO } from "@/lib/format";
import { levelOptions } from "../students/student-fields";

export const metadata = { title: "Documents" };

function Doc({ title, text, icon, children }: { title: string; text: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-line bg-white p-4 shadow-xs sm:p-5">
      <div className="mb-3 flex gap-3">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand [&_svg]:size-5">{icon}</span>
        <div className="min-w-0">
          <h2 className="font-bold text-navy">{title}</h2>
          <p className="mt-0.5 text-sm text-muted">{text}</p>
        </div>
      </div>
      <div className="mt-auto">{children}</div>
    </section>
  );
}

export default async function Documents() {
  const user = await requireUser();
  const has = (p: Permission) => can(user.role, p);
  const teacher = user.role === "ENSEIGNANT";
  const [groups, levels, teachers] = await Promise.all([
    db.group.findMany({ where: { active: true, schoolYear: { active: true }, ...groupScope(user) }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    levelOptions(db),
    has("teachers.read") ? db.teacher.findMany({ where: { active: true }, orderBy: { lastName: "asc" } }) : [],
  ]);
  const month = todayISO().slice(0, 7);
  const groupSelect = <select name="group" required className="input" aria-label="Groupe"><option value="">Choisir un groupe…</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}</select>;
  const btn = <ApplyButton>Générer</ApplyButton>;

  return (
    <>
      <PageHeader title="Documents à imprimer" subtitle={teacher ? "Listes de classe, feuilles d'appel, emploi du temps et synthèses de vos classes, aux couleurs de VAMOS ACADEMY. Utilisez « Imprimer » puis « Enregistrer au format PDF » si besoin." : "Tous les documents portent l'identité officielle de VAMOS ACADEMY et la date d'édition (heure de Tunis). Utilisez « Imprimer » puis « Enregistrer au format PDF » si besoin."} />
      <div className="grid gap-4 sm:gap-6 md:grid-cols-2 xl:grid-cols-3">
        {has("students.read") && (
          <Doc icon={<Users />} title={teacher ? "Liste d'élèves d'une classe" : "Liste d'élèves par groupe"} text={teacher ? "Liste nominative de votre classe, avec le téléphone du parent." : "Liste nominative avec matricule et téléphone du parent ; export Excel disponible."}>
            <form action="/documents/group-list" className="grid gap-2 xs:grid-cols-[1fr_auto]">{groupSelect}{btn}</form>
          </Doc>
        )}
        {has("students.read") && !teacher && (
          <Doc icon={<UsersRound />} title="Liste d'élèves par niveau" text="Tous les élèves actifs d'un niveau scolaire (classe), avec leurs groupes.">
            <form action="/documents/level-list" className="grid gap-2 xs:grid-cols-[1fr_auto]">
              <select name="level" required className="input" aria-label="Niveau"><option value="">Choisir un niveau…</option>{levels.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}</select>{btn}
            </form>
          </Doc>
        )}
        {has("attendance.read") && (
          <Doc icon={<ClipboardList />} title="Feuille de présence" text="Grille du mois (élèves × séances prévues) : vierge pour l'appel papier, ou remplie avec les appels enregistrés.">
            <form action="/documents/attendance-sheet" className="grid gap-2">
              {groupSelect}
              <div className="grid grid-cols-2 gap-2"><input type="month" name="month" defaultValue={month} className="input min-w-0" aria-label="Mois" />
                <select name="mode" className="input" aria-label="Type"><option value="filled">Remplie</option><option value="blank">Vierge</option></select><div className="col-span-2 [&>button]:w-full">{btn}</div></div>
            </form>
          </Doc>
        )}
        {has("academics.read") && (
          <Doc icon={<CalendarDays />} title="Emploi du temps" text={teacher ? "Votre grille hebdomadaire, prête à imprimer." : "Grille hebdomadaire imprimable : tout le centre, par enseignant ou par salle."}>
            <form action="/schedule" className="grid gap-2 xs:grid-cols-[1fr_auto]">
              {teachers.length > 0 && <select name="teacher" className="input" aria-label="Enseignant"><option value="">Tout le centre</option>{teachers.map((t) => <option key={t.id} value={t.id}>{t.lastName} {t.firstName}</option>)}</select>}
              <input type="hidden" name="print" value="1" />{btn}
            </form>
          </Doc>
        )}
        {has("grades.read") && (
          <Doc icon={<NotebookPen />} title="Synthèse pédagogique" text="Par groupe : moyenne de chaque élève, assiduité, absences et dernière appréciation, pour un trimestre ou l'année.">
            <form action="/documents/pedagogy" className="grid gap-2">
              {groupSelect}
              <div className="grid gap-2 xs:grid-cols-[1fr_auto]"><select name="term" className="input" aria-label="Trimestre"><option value="">Toute l&apos;année</option><option value="1">Trimestre 1</option><option value="2">Trimestre 2</option><option value="3">Trimestre 3</option></select>{btn}</div>
            </form>
          </Doc>
        )}
        {has("students.read") && !teacher && (
          <Doc icon={<FileSpreadsheet />} title="Fiche d'inscription / bulletin" text="Depuis le dossier de l'élève : « Fiche d'inscription » (administration), « Bulletin » et « Relevé de compte » (finances).">
            <CardLink href="/students">Ouvrir la liste des élèves →</CardLink>
          </Doc>
        )}
        {has("payments.read") && (
          <Doc icon={<Receipt />} title="Reçus & état des impayés" text="Chaque reçu est imprimable et téléchargeable en PDF ; l'état des impayés s'imprime et s'exporte (CSV, Excel).">
            <div className="flex gap-4"><CardLink href="/payments">Paiements →</CardLink><CardLink href="/unpaid">Impayés →</CardLink></div>
          </Doc>
        )}
        {has("reports.read") && (
          <Doc icon={<BarChart3 />} title="Rapports financiers" text="Rapport mensuel ou annuel (recettes, dépenses, rémunérations, résultat, impayés), imprimable et exportable.">
            <form action="/reports" className="grid gap-2 xs:grid-cols-[1fr_auto]"><input type="month" name="month" defaultValue={month} className="input" aria-label="Mois" />{btn}</form>
            <p className="mt-3"><CardLink href="/reports">Rapport de l&apos;année scolaire →</CardLink></p>
          </Doc>
        )}
        {has("expenses.read") && (
          <Doc icon={<HandCoins />} title="Fiches de rémunération" text="Fiche par enseignant et par mois, avec le détail des séances.">
            <CardLink href="/payroll">Rémunérations →</CardLink>
          </Doc>
        )}
      </div>
    </>
  );
}
