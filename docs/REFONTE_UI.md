# Refonte UI/UX mobile-first — audit, plan et stratégie responsive

Point de départ : branche `claude/compassionate-feynman-733eed` (Next 16.4.1, Prisma 7.10.1, Zod 4.6.7).
Ce document décrit ce qui a été constaté avant les travaux, les choix faits et la stratégie retenue pour chaque module.

## 1. Audit avant travaux

Lu : toutes les routes et layouts de `src/app`, tous les composants de `src/components`, `globals.css`, le schéma Prisma
(41 modèles/énumérations), les routes API (export, reçus PDF, justificatifs, santé), l'authentification et les permissions
(`pageUser` / `requirePermission`, `scope.ts`), le blueprint, les tests (Vitest, Playwright, `qa:crawl`) et la documentation de déploiement.

### Problèmes constatés

| # | Domaine | Problème | Gravité |
|---|---|---|---|
| A1 | Tableaux | Toutes les listes utilisent un `<table>` en `whitespace-nowrap` dans un conteneur `overflow-x-auto` (élèves : 9 colonnes, rémunérations : 8 colonnes avec formulaires intégrés en `min-w-64`). Sur téléphone, l'essentiel des données et les actions de ligne sont hors écran, accessibles seulement par défilement horizontal du tableau. | Élevée |
| A2 | Navigation mobile | Seul un bouton « hamburger » ; aucune navigation au pouce ; la barre supérieure entasse champ de recherche, cloche et profil (≈ 320 px). Le panneau de notifications (`w-80`) dépasse de l'écran à 320 px. | Élevée |
| A3 | Filtres | 4 à 7 champs empilés pleine largeur au-dessus de chaque liste sur mobile (paiements : 8 champs avant la première donnée). Boutons « Filtrer / Ouvrir / Afficher / OK / Générer » codés à la main en 15 endroits, libellés incohérents. | Moyenne |
| A4 | Cibles tactiles | Boutons ≈ 36 px, boutons « small » ≈ 24 px, pastilles d'appel ≈ 26 px, pagination ≈ 28 px, cases à cocher 16 px. | Moyenne |
| A5 | Formulaires de création | « Nouveau groupe », « Nouvel enseignant », « Nouvelle dépense » sont posés sous la liste : page très longue, action principale introuvable sur mobile. | Moyenne |
| A6 | Accessibilité | `id` de champ = `name` : identifiants dupliqués dès que deux formulaires partagent un nom (dossier élève : formulaire du dossier + chaque parent), les `<label>` pointent vers le mauvais champ. Erreurs non reliées par `aria-describedby`, focus non déplacé vers la première erreur, aucun lien d'évitement, liens sans style de focus, `aria-sort` posé sur le lien et non sur l'en-tête, libellés de section du menu à faible contraste (blanc 40 %). | Élevée |
| A7 | Emploi du temps | Grille de 6 colonnes qui devient une seule colonne de 6 jours sur mobile, sans repère « aujourd'hui », sans état de l'appel ni signalement des chevauchements. | Moyenne |
| A8 | Saisie | Champs en `text-sm` (14 px) : zoom automatique d'iOS au focus. Pas d'export `viewport`, pas de prise en compte des zones sûres (encoche, barre d'accueil). | Moyenne |
| A9 | Dialogues | `<dialog>` centré, pas de verrouillage du défilement de l'arrière-plan, pas de présentation en feuille sur mobile. | Faible |
| A10 | Tableau de bord | 9 cartes de même poids ; sur mobile, la séance du jour et les tâches arrivent après les graphiques ; pas d'activité enseignants/salles ni des prochains cours. | Moyenne |
| A11 | Documents imprimables | Padding fixe de 32 px et tableaux larges (feuille de présence : jusqu'à 14 colonnes) qui débordent à l'écran sur téléphone. | Faible |
| A12 | Fiches détaillées | Pas de retour vers la liste ; 5 boutons d'en-tête qui passent sur 3 lignes (dossier élève). | Faible |
| A13 | Fonctionnel inachevé | Réinscription en masse vers une nouvelle année annoncée « prévue (E7) » dans les paramètres ; pas de vue « salles » (gérées dans Groupes & cours). | Information |

Points solides conservés tels quels : contrôle des permissions côté serveur à chaque page et action, périmètre enseignant
(`scope.ts`), montants en millimes, corrections/annulations tracées, saisie conservée en cas d'erreur (`Form`),
indicateurs de chargement par lien (`useLinkStatus`) au lieu d'un `loading.tsx` global.

## 2. Plan

1. **Système de design** (`globals.css`, `@theme`) : jetons de couleur (rouge du logo, marine, neutres, statuts),
   typographie, rayons, élévations, mouvement, points de rupture, états (focus, pressé, désactivé, invalide).
2. **Composants partagés** : boutons (tailles, cibles 44 px au toucher), champs accessibles (`useId`, `aria-describedby`,
   focus sur la première erreur), tableau responsive (cartes automatiques sur mobile), barre de filtres repliable,
   feuille (`Sheet`) plein écran sur mobile / panneau latéral sur bureau, dialogue de confirmation en feuille,
   en-tête de page avec retour, actions et action principale, états vides, squelettes.
3. **Coquille** : barre latérale bureau, barre supérieure compacte, barre d'onglets inférieure selon le rôle + menu
   complet en tiroir, recherche plein écran, notifications et compte dans des panneaux qui restent dans l'écran.
4. **Modules** : tableau de bord recomposé, puis chaque route (aucune page laissée sur l'ancien design).
5. **Vérifications** : lint, TypeScript, Vitest, Playwright (étendu aux fenêtres mobiles), build, `qa:crawl`,
   contrôles navigateur aux largeurs demandées.

## 3. Système de design

Jetons dans `src/app/globals.css` (`@theme`, Tailwind 4) :

- **Couleurs** : rouge du logo `brand-600 #c1272d` (actions principales, accents, onglet actif), échelle 50–800 ; marine
  `navy-900 #14213d` (barre latérale, titres, boutons d'application de filtres) ; neutres `ink`, `ink-soft`, `muted` (5,9:1),
  `faint` (décoratif), `surface`, `surface-2`, `line`, `line-strong` ; statuts sobres `success`, `warning`, `danger`, `info`
  (fond 50 + texte 600/700, toujours ≥ 4,5:1, jamais la couleur seule : un libellé accompagne chaque statut).
- **Typographie** : Inter (texte), Plus Jakarta Sans (titres, chiffres clés). Champs en 16 px sur mobile (pas de zoom iOS),
  14 px à partir de 640 px ; le zoom du navigateur reste autorisé (pas de `maximumScale`).
- **Rayons** `sm/md/lg/xl`, **élévations** `shadow-xs → lg` (ombres marines discrètes), **mouvement** `ease-out-soft`,
  160 ms par défaut, animations `sheet-up`, `sheet-left`, `fade-in`, `pop` ; tout est neutralisé par `prefers-reduced-motion`.
- **Points de rupture** : `xs` 400 · `sm` 640 · `md` 768 · `lg` 1024 · `xl` 1280 · `2xl` 1536 ; requêtes de conteneur
  (`@container`) pour les formulaires affichés tantôt en page, tantôt dans un panneau.
- **États** : focus visible rouge (2 px, décalé) partout au clavier ; pressé (`active:scale-[0.98]`, fond plus foncé) ;
  désactivé (opacité 55 %, pas de pointeur) ; invalide (bordure `danger`, message relié au champ).
- **Cibles tactiles** : 44 px au toucher (`pointer-coarse`), plus compactes à la souris (`pointer-fine`).

Composants (`src/components`) : `Button`/`LinkButton` (variantes primary, navy, secondary, danger, ghost ; tailles sm/md/lg),
`ApplyButton`, `Card`, `CardLink`, `PageHeader` (retour, méta, action principale, actions secondaires défilantes), `SectionTitle`,
`Callout`, `Field` + `Input`/`Select`/`Textarea`/`Checkbox` (identifiants uniques, `aria-describedby`, focus sur la 1re erreur),
`FormActions` (barre collante sur mobile), `Table`/`Td` (cartes automatiques), `FilterBar`/`FilterField` (filtres repliables),
`Pagination`, `Sheet` (panneau plein écran / latéral), `ConfirmAction` (feuille basse / fenêtre), `Bulk` (barre de sélection
au-dessus des onglets sur mobile), `Badge`, `Stat`, `EmptyState`, `DescriptionList`, `Skeleton`, `Phone`, graphiques
`BarChart` (version téléphone lisible) et `HBars`.

## 4. Stratégie responsive par module

| Module | Téléphone (< 640 px) | Tablette (640–1023 px) | Bureau (≥ 1024 px) |
|---|---|---|---|
| Coquille | Barre supérieure compacte (logo, loupe plein écran, cloche, compte), 4 onglets selon le rôle + *Menu* (tiroir complet avec recherche), zones sûres | Idem, onglets centrés | Barre latérale marine fixe, recherche dans la barre supérieure |
| Tableau de bord | Une colonne priorisée : Aujourd'hui → À traiter → chiffres clés 2×2 → retards → absences → paiements → prochains cours → graphique (6 derniers mois) → salles, enseignants, activité | Grilles 2 colonnes | 3 colonnes ; finances chargées en flux avec squelettes |
| Élèves (liste) | Cartes : nom + matricule, niveau/statut, groupes, téléphone cliquable, solde ; sélection 44 px ; recherche visible, filtres repliés | Cartes à 3 valeurs par ligne | Tableau triable |
| Dossier élève | Sections ancrées (pastilles collantes), contacts tôt dans la page (appel / WhatsApp), modification dans un panneau plein écran, sous-tableaux en cartes | Idem | 2/3 + 1/3 |
| Inscription | Formulaire en 4 étapes numérotées, une colonne, bouton collant | 2 colonnes | 2–4 colonnes |
| Enseignants, parents, groupes | Cartes, création dans un panneau | Cartes | Tableaux ; fiche groupe : créneaux à droite |
| Emploi du temps | Vue agenda d'un jour (onglets, aujourd'hui par défaut), conflits en rouge, état de l'appel du jour | Semaine sur 3 colonnes | Semaine sur 6 colonnes ; impression sur 6 colonnes |
| Présences | Liste des séances du jour, veille/lendemain, appel à gros boutons, enregistrement collant | Idem | Appel + séances récentes |
| Notes | Relevé = vrai tableau défilant dans son cadre, 1re colonne fixe ; saisie en liste note + appréciation | Idem | Relevé + saisie + évaluation |
| Paiements | Cartes (élève, reçu, montant en gras, état) ; encaissement en 2 étapes, échéances en grandes lignes cochables, total + validation collants | Cartes | Tableau, totaux par moyen |
| Impayés, dépenses, rémunérations | Cartes avec montant en tête et actions (Encaisser, Relevé, Valider, Payer) dans la carte ; nouvelle dépense dans un panneau | Cartes | Tableaux |
| Rapports | Filtres en grille 2 colonnes, chiffres clés 2×2, mois en cartes | Idem | Tableau mensuel |
| Notifications, messages | Cartes, copie / WhatsApp en boutons, barre d'actions groupées au-dessus des onglets | Cartes | Tableaux |
| Documents imprimables | Marges réduites, en-tête empilé, grands tableaux défilant dans le document ; impression inchangée (A4) | Idem | Idem |
| Paramètres, utilisateurs, audit, profil | Onglets défilants, mois facturés en pastilles tactiles, cartes, détails d'audit repliés | Idem | Grilles |
| Connexion | Bandeau rouge, logo, champs 16 px, bouton large | Idem | Panneau marine + formulaire |

