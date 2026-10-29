# VAMOS ACADEMY — Plateforme de gestion (Blueprint)

> Document de référence du projet. Toute évolution fonctionnelle ou technique doit le mettre à jour.
> Version 1.0 — 29/10/2026.

---

## 0. Audit de départ

### 0.1 Dépôts existants

| Élément | Constat | Décision |
|---|---|---|
| `~/Documents/VamosAcademy` | Application **mobile** élèves (Expo/React Native + projet Android Kotlin) : exercices, jeux, gamification par tranche d'âge. Produit différent, en cours de développement. | **Non modifiée.** Le SaaS de gestion vit dans un dépôt séparé `VamosAcademy-Gestion`. Une API commune pourra être exposée plus tard (cf. §6.4). |
| Identité visuelle du dépôt mobile | `DESIGN_SYSTEM.md` et `theme/tokens.ts` reprennent les couleurs du **Club Africain** et le logo « hibou doré » n'est pas le logo officiel. | Non réutilisés. Le SaaS suit le **logo officiel rouge/gris** (publication Instagram `vamos_academy_kelibia`). |
| Schéma Prisma du mobile | Centré élève/exercices ; énumération `CenterBranch` fictive (Tunis, Sousse, Sfax, Bizerte). | Non réutilisé : un seul centre réel (Kelibia), structure configurable. |
| `lib/auth.ts` du mobile | Authentification simulée en mémoire, élève démo de repli. | Non réutilisable en production ; le SaaS a sa propre authentification sécurisée. |

### 0.2 Points d'attention
- **Logo** : seul un logo basse résolution (244×128 px, extrait d'une capture) est disponible → `public/brand/logo.png`. **À remplacer par le fichier vectoriel (SVG/PDF) officiel** dès que possible.
- **Tarifs, classes et matières réels inconnus** : tout est paramétrable ; les données de démonstration (`prisma/seed.ts`) sont clairement fictives.
- Les niveaux du système tunisien : *ابتدائي* Primaire (1ʳᵉ–6ᵉ année), *أساسي* Collège / enseignement de base (7ᵉ–9ᵉ année), *ثانوي* Secondaire (1ʳᵉ année → Bac).

---

## 1. Identité et paramètres du centre

| Paramètre | Valeur |
|---|---|
| Nom | VAMOS ACADEMY |
| Adresse | نهج غزة، حي الرياض، قليبية — Rue de Gaza, Cité Riadh, Kelibia, Tunisie |
| Téléphone | 20 807 657 |
| Année de départ | 2026–2027 |
| Langue | Français (interface), noms arabes acceptés (UTF‑8, RTL ponctuel) |
| Devise | Dinar tunisien — TND, 3 décimales (millimes) |
| Fuseau | Africa/Tunis |
| Formats | Dates `jj/mm/aaaa`, nombres `1 234,500 DT` (locale `fr-TN`) |

**Direction artistique** (tokens CSS, `src/app/globals.css`) :

| Token | Hex | Usage |
|---|---|---|
| `brand` | `#C1272D` | Rouge VAMOS — actions principales, accents, logo |
| `brand-dark` | `#9B1C22` | Survol / pressé |
| `navy` | `#14213D` | Barre latérale, titres, contraste |
| `gray` | `#6B7280` (gris logo) | Texte secondaire |
| `surface` | `#F5F6F8` | Fond d'application (gris clair) |
| blanc | `#FFFFFF` | Cartes, tableaux |

Les montants sont **stockés en millimes (entier)** pour éviter toute erreur d'arrondi : `45,000 DT` = `45000`.

---

## 2. Cahier des charges fonctionnel

Légende priorité : **P1** = livré dans le MVP, **P2** = itération suivante, **P3** = évolution.

### 2.1 Tableau de bord (P1)
- Indicateurs : élèves actifs, inscriptions de l'année, encaissements du mois, impayés cumulés, dépenses du mois, solde du mois, taux de présence des 30 derniers jours.
- Liste des derniers paiements, des élèves en retard de paiement, séances du jour.
- Le contenu dépend du rôle (un enseignant ne voit pas les finances).

### 2.2 Élèves et inscriptions (P1)
- Fiche élève : matricule auto (`VA-2026-0001`), nom, prénom, nom arabe (optionnel), date de naissance, sexe, établissement scolaire d'origine, niveau/classe scolaire, téléphone, adresse, remarques médicales, statut (actif, suspendu, parti).
- Recherche, filtres (niveau, classe, statut), pagination.
- **Inscription** = élève × groupe × année scolaire, avec date d'entrée/sortie, tarif mensuel appliqué (hérité du groupe, remise possible en % ou montant), frais d'inscription.
- Un élève peut être inscrit dans plusieurs groupes (plusieurs matières).
- Critères d'acceptation : création ⇒ matricule unique ; impossible d'inscrire deux fois le même élève au même groupe sur la même année ; archivage plutôt que suppression si historique financier.

### 2.3 Parents et contacts d'urgence (P1)
- Tuteurs (père, mère, tuteur légal) : nom, téléphone principal (obligatoire, format tunisien 8 chiffres), téléphone secondaire, e‑mail, profession, CIN optionnelle (masquée par défaut).
- Liaison N–N élève ↔ tuteur avec lien de parenté, indicateur « contact d'urgence » et « payeur ».
- Fratries : un tuteur relié à plusieurs élèves (remise fratrie configurable, P2).

### 2.4 Enseignants et rémunérations (P1 fiche / P2 paie)
- Fiche : identité, téléphone, e‑mail, matières enseignées, mode de rémunération (**horaire**, **mensuel fixe**, **pourcentage** des mensualités du groupe), taux.
- P2 : calcul mensuel automatique depuis les séances réalisées (présences enseignant), validation, versement, historique, bulletin PDF.

### 2.5 Niveaux, classes, matières et groupes (P1)
- **Cycle** (Primaire, Collège, Secondaire) → **Niveau scolaire** (ex. « 9ᵉ année de base », « 4ᵉ année Sciences exp. ») — configurables, ordonnés.
- **Matière** : code, nom, couleur.
- **Groupe** = cours facturable : année scolaire, niveau, matière, enseignant, salle par défaut, capacité, tarif mensuel, frais d'inscription. Indicateur de remplissage.

### 2.6 Emplois du temps et salles (P1 base / P2 avancé)
- Salles : nom, capacité.
- Créneaux hebdomadaires par groupe (jour, début, fin, salle).
- **Détection de conflits** : même salle ou même enseignant sur un créneau qui se chevauche ⇒ refus.
- Vue hebdomadaire. P2 : exceptions (séances annulées / rattrapages), vue enseignant, impression.

### 2.7 Présences et absences (P1)
- Séance = groupe × date. Appel nominatif : présent, absent, retard, excusé.
- Statistiques par élève et par groupe. P2 : SMS automatique au parent après absence.

### 2.8 Notes et suivi pédagogique (P1 — livré en v1)
- Évaluations (devoir, test, examen blanc) par groupe, barème /20, coefficient.
- Saisie de notes, moyennes, observations, bulletin trimestriel PDF.

### 2.9 Paiements, mensualités, impayés et reçus (P1)
- **Échéancier** : génération mensuelle des échéances (septembre → juin, configurable par année scolaire) pour chaque inscription active ; idempotente.
- **Paiement** : montant, mode (espèces, chèque, virement, D17/e‑dinar), date, référence, affecté à une ou plusieurs échéances (allocation automatique de la plus ancienne à la plus récente).
- Statut d'échéance calculé : payée, partielle, impayée, en retard (après le jour limite configurable).
- **Reçu** imprimable numéroté séquentiellement par année (`R-2026-000123`), non modifiable ; annulation = paiement d'annulation tracé (jamais de suppression).
- Liste des impayés par élève/tuteur avec total, export CSV.

### 2.10 Dépenses et rapports financiers (P1)
- Catégories configurables (loyer, électricité, salaires, fournitures, marketing…).
- Dépense : date, catégorie, libellé, montant, mode, justificatif (P2 : fichier joint).
- Rapport mensuel : encaissements vs dépenses, solde, par catégorie ; export CSV.

### 2.11 Notifications et communication (P2)
- Journal des messages, modèles (rappel d'impayé, absence, annonce).
- Canaux : SMS (fournisseur tunisien, ex. passerelle HTTP), WhatsApp click‑to‑chat (lien `wa.me` — P1 en lien simple), e‑mail.
- Notifications internes dans l'application.

### 2.12 Documents, exports et impressions (P1 partiel)
- P1 : reçu imprimable (CSS print), export CSV (élèves, paiements, impayés, dépenses).
- P2 : attestation d'inscription, fiche élève, liste de classe, bulletin, PDF serveur.

### 2.13 Utilisateurs, rôles et permissions (P1)
- Comptes internes uniquement (pas d'inscription publique). Création par l'administrateur.
- Rôles : voir §4. Permissions vérifiées **côté serveur** à chaque action.
- P3 : portail parent / enseignant en lecture.

### 2.14 Paramètres du centre et années scolaires (P1)
- Informations du centre (nom, adresse, téléphone, logo, mentions du reçu).
- Années scolaires : libellé, début, fin, mois facturés, jour limite de paiement, **une seule active**.
- Clôture d'année (P2) : réinscription en masse vers l'année suivante.

### 2.15 Sauvegardes, audit et sécurité (P1)
- **Journal d'audit** : toute création/modification/annulation sensible (élèves, paiements, dépenses, utilisateurs, paramètres) avec auteur, date, entité, détail JSON.
- Sauvegarde : script `pg_dump` quotidien (`scripts/backup.sh`) avec rotation ; procédure de restauration documentée.
- Sécurité : mots de passe bcrypt (coût 12), sessions opaques stockées en base (jeton aléatoire 256 bits, seul le hash SHA‑256 est stocké), cookie `HttpOnly; SameSite=Lax; Secure` en production, expiration 12 h glissante (prolongée à mi-parcours), verrouillage après 5 échecs (15 min), validation Zod serveur, requêtes paramétrées (Prisma), aucune donnée sensible en URL.

---

## 3. Schéma de données relationnel

Source de vérité : `prisma/schema.prisma`. Vue d'ensemble :

```
CenterSettings (1)
SchoolYear 1─┬─< Group >─── Level >── Cycle
             │      │  └── Subject
             │      ├── Teacher ──< TeacherSubject >── Subject
             │      ├── Room
             │      ├──< ScheduleSlot >── Room
             │      ├──< Enrollment >── Student ──< StudentGuardian >── Guardian
             │      └──< AttendanceSession ──< AttendanceRecord >── Student
             ├──< Enrollment ──< Invoice (échéance mensuelle) ──< PaymentAllocation >── Payment
             ├──< Payment (reçu) ── Student
             └──< Expense >── ExpenseCategory

User ──< Session ;  User ──< AuditLog ;  Teacher 0..1 ── User
Assessment ──< Grade (P2)
```

Règles clés :
- `Enrollment` unique sur (`studentId`, `groupId`).
- `Invoice` unique sur (`enrollmentId`, `period` = `AAAA-MM`) ⇒ génération idempotente.
- `Payment.receiptNo` unique ; `Payment.cancelledAt` au lieu de suppression.
- Montants : `Int` en millimes.
- `ScheduleSlot` : contrôle applicatif des chevauchements salle/enseignant.

---

## 4. Matrice des rôles et permissions

Rôles (v1) : **Administrateur**, **Responsable administratif**, **Comptable**, **Enseignant**, **Lecture seule**.
(Migration `operational_v1` : les anciens rôles Direction et Secrétariat deviennent Responsable administratif.)

| Permission | ADMIN | RESPONSABLE | COMPTABLE | ENSEIGNANT | LECTURE |
|---|:-:|:-:|:-:|:-:|:-:|
| Tableau de bord (indicateurs financiers) | ✔ | ✔ | ✔ | — | — |
| `students.read` | ✔ | ✔ | ✔ | ✔ ses groupes | ✔ |
| `students.write` (dossiers, parents, inscriptions, archivage) | ✔ | ✔ | — | — | — |
| `academics.read` (groupes, emploi du temps) | ✔ | ✔ | — | ✔ ses groupes | ✔ |
| `academics.write` (groupes, créneaux, salles, matières, niveaux) | ✔ | ✔ | — | — | — |
| `teachers.read` / `teachers.write` | ✔/✔ | ✔/✔ | ✔/— | — | ✔/— |
| `attendance.read` / `attendance.write` | ✔/✔ | ✔/✔ | — | ✔/✔ ses groupes | ✔/— |
| `grades.read` / `grades.write` | ✔/✔ | ✔/— | — | ✔/✔ ses groupes | ✔/— |
| `payments.read` / `payments.write` | ✔/✔ | ✔/✔ | ✔/✔ | — | — |
| `payments.cancel` | ✔ | — | ✔ | — | — |
| `expenses.read` / `expenses.write`, `reports.read` | ✔ | — | ✔ | — | — |
| `users.manage` (+ purge des données de démo) | ✔ | — | — | — | — |
| `settings.manage` | ✔ | — | — | — | — |
| `payroll.manage` (calcul, validation, paiement des rémunérations) | ✔ | — | ✔ | — | — |
| `messages.write` (préparer rappels et messages) | ✔ | ✔ | ✔ | — | — |
| `audit.read` | ✔ | ✔ | — | — | — |

Implémentation : `src/lib/permissions.ts` (table statique), `requirePermission()` dans chaque Server Action,
`pageUser()` dans chaque page, `src/server/scope.ts` pour restreindre l'enseignant à ses groupes
(listes, dossiers, appels, notes). Vérifié par `tests/actions.integration.test.ts` (actions appelées avec
une vraie session pour chaque rôle) et par une matrice d'accès HTTP sur toutes les pages.

## 4 bis. v2 — Finances, communication, documents (29/10/2026)

### Audit avant travaux
- Moyens de paiement codés en dur (énumération) → **table `PaymentMode` configurable** (migration de données sans perte).
- Suppression physique des dépenses et des échéances à la sortie d'un élève → **annulation tracée** (`cancelledAt`, `cancelReason`) ; plus aucune suppression d'opération financière.
- Tarifs uniquement par groupe → **grille tarifaire** `FeeRule` (année × cycle/niveau × matière, règle la plus précise).
- Échéancier uniquement mensuel → **mensuel, trimestriel, annuel** par inscription (`Enrollment.plan`, `Invoice.months`).
- Pas de rémunération enseignant, ni notifications persistantes, ni messages, ni PDF/Excel → ajoutés (ci-dessous).

### Règles financières
- Montants en **millimes entiers** partout (calculs, base, exports) ; pourcentages arrondis au millime (`percentOf`).
- Paiement partiel ou complet ; affectation FIFO ou sur échéances choisies ; trop-perçu refusé ; date future refusée ;
  référence obligatoire selon le moyen de paiement.
- **Correction d'un paiement** : le reçu d'origine est annulé (« Corrigé par R-… : motif ») et un nouveau reçu lié est émis
  (`Payment.correctsId`). **Correction d'une dépense** : même principe (`Expense.correctsId`). Annulations avec motif obligatoire.
- **Changement de tarif / d'échéancier** : échéances non payées à partir du mois choisi annulées puis régénérées ; payées conservées.
- **Rémunérations** (`TeacherPay`) : heure (séances pointées × durée du créneau), par séance, forfait mensuel, % des mensualités
  encaissées sur ses groupes ; brouillon → validée (ajustement justifié) → payée (crée la dépense liée) ; annulation tracée.
- Justificatifs de dépenses : PDF/JPG/PNG ≤ 5 Mo, type vérifié sur le contenu, stockés hors `public/` (`STORAGE_DIR`),
  servis par `/api/attachments/[id]` après contrôle `expenses.read`.

### Communication
- `Notification` persistante (type, permission requise, enseignant ciblé, statut NOUVELLE → LUE → TRAITÉE, note de traitement),
  dédoublonnée par `dedupeKey`. Événements : nouvel inscrit, paiement, absence. Alertes datées (≤ 1/min) : échéance à 3 jours,
  retard mensuel, absence > 48 h sans justificatif (fermée automatiquement quand le motif est saisi), dépense sans justificatif.
- `MessageTemplate` / `Message` : préparation de messages en français (parents, enseignants) à partir des données serveur ;
  canal **MANUEL uniquement** (copier, lien WhatsApp ouvert par l'utilisateur, confirmation « envoyé »).
  `src/server/messaging` définit l'interface `ChannelProvider` ; SMS, WhatsApp API et e-mail sont des emplacements désactivés.

### Documents
Reçu (impression + PDF serveur), fiche d'inscription, relevé de compte, bulletin, liste par groupe / par niveau, feuille de présence
(vierge ou remplie), emploi du temps, synthèse pédagogique, état des impayés, rapport financier mensuel / annuel / période,
fiche de rémunération. En-tête officiel + date d'édition (Africa/Tunis). Exports CSV et Excel (`/api/export/[kind]`).

## 5. Architecture technique

### 5.1 Stack
- **Next.js 15 (App Router) + TypeScript strict**, React Server Components, Server Actions.
- **Tailwind CSS v4**, composants maison accessibles (`src/components/ui`), icônes `lucide-react`.
- **PostgreSQL 16 + Prisma 6** (migrations versionnées).
- **Zod** : schémas partagés client/serveur (`src/lib/validation`).
- **Vitest** : tests unitaires (logique métier, permissions, formats) et tests d'intégration sur base de test.

### 5.2 Couches
```
UI (app/, components/)        → rendu, formulaires, aucune règle métier
Actions (app/**/actions.ts)   → auth + permission + validation Zod + appel service + revalidate
Services (src/server/services) → règles métier pures, transactions Prisma, audit
Données (src/server/db.ts)    → client Prisma unique
Sécurité (src/server/auth.ts, src/lib/permissions.ts)
```
Les modules `src/server/**` importent `server-only` : impossible de les embarquer côté client ; les secrets ne sont lus que là.

### 5.3 Structure des fichiers
```
docs/PROJECT_BLUEPRINT.md
prisma/schema.prisma · prisma/migrations/ · prisma/seed.ts
scripts/backup.sh
src/app/
  login/                      page de connexion
  (app)/layout.tsx            coque authentifiée (barre latérale)
  (app)/dashboard/
  (app)/students/ [id]/ new/
  (app)/guardians/
  (app)/teachers/
  (app)/academics/            niveaux, matières, salles, groupes
  (app)/groups/[id]/          détail groupe, inscrits, EDT
  (app)/schedule/
  (app)/attendance/
  (app)/payments/ receipts/[id]/ unpaid/
  (app)/expenses/
  (app)/reports/
  (app)/users/
  (app)/settings/
  (app)/audit/
  api/export/[kind]/route.ts  exports CSV
src/components/ui/            Button, Input, Card, Table, Badge…
src/lib/                      format.ts, permissions.ts, validation/
src/server/                   db.ts, auth.ts, audit.ts, services/*
tests/
```

### 5.4 Évolutions prévues
- API REST/JSON authentifiée par jeton pour l'**application mobile** existante (consultation des notes, présences, paiements par les parents/élèves).
- Déploiement : Vercel ou VPS (Docker) + PostgreSQL managé ; variables `DATABASE_URL`, `SESSION_SECRET`.

---

## 6. Plan de réalisation

| Étape | Contenu | Critères d'acceptation |
|---|---|---|
| **E0** Fondations | Projet, Tailwind, Prisma, thème, layout, formats fr‑TN | `npm run build` OK ; logo officiel affiché ; montants affichés `1 234,500 DT` |
| **E1** Sécurité | Utilisateurs, sessions, login/logout, RBAC, audit, verrouillage | Accès non connecté ⇒ redirection `/login` ; rôle sans permission ⇒ 403 ; tests permissions verts |
| **E2** Paramètres | Centre, années scolaires (une active) | Changement d'année active effectif dans tous les modules |
| **E3** Structure pédagogique | Cycles, niveaux, matières, salles, groupes, enseignants | CRUD complet ; groupe affiche remplissage |
| **E4** Élèves | Élèves, tuteurs, inscriptions | Matricule unique ; double inscription refusée ; recherche |
| **E5** Finances | Échéancier, paiements, reçus, impayés, dépenses, rapport | Génération idempotente ; allocation FIFO testée ; reçu imprimable ; annulation tracée |
| **E6** Présences & EDT | Créneaux avec conflits, appel | Conflit salle/enseignant refusé (test) ; taux de présence au tableau de bord |
| **E7** v1 opérationnelle | Notes, disponibilités, conflits groupe/enseignant, archivage, doublons, réductions autorisées, historique, fiche d'inscription, 5 rôles, données de démo marquées | Tests d'intégration des actions par rôle ✅ |
| **E8** v2 | Grille tarifaire, échéanciers, moyens de paiement, corrections tracées, justificatifs, paie enseignants, notifications, messages préparés, PDF/Excel, documents, filtres persistants, actions groupées | `tests/scenario.integration.test.ts` (critères 1 à 8) ✅ |
| **E8b** P2 | Envoi réel SMS/WhatsApp (après accord), clôture et réinscription annuelle, portail parents, PDF serveur des autres documents | — |
| **E9** Exploitation | Sauvegardes, déploiement, monitoring | Restauration testée sur base vierge |

État d'avancement : voir `README.md` § « État ».
