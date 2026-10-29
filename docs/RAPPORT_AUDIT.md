# Rapport d'audit avant mise en service — 29/10/2026

Périmètre : fonctionnalités, sécurité, tests, déploiement. Ce rapport ne décrit que ce qui a été réellement exécuté.

## 1. Fonctionnalités opérationnelles (vérifiées)

Élèves (création, doublons, archivage, historique), parents, inscriptions avec réductions et échéanciers, groupes et créneaux
avec contrôle des conflits, enseignants et disponibilités, présences avec justificatifs, notes et moyennes, paiements complets et
partiels, reçus (impression + PDF), corrections et annulations tracées, impayés, dépenses avec justificatifs, rémunérations,
rapports par période, notifications avec suivi, messages préparés (envoi manuel), documents imprimables, exports CSV/Excel,
5 rôles appliqués côté serveur, journal d'audit, sauvegarde et restauration.

## 2. Tests exécutés

| Vérification | Résultat |
|---|---|
| ESLint, TypeScript (`tsc --noEmit`) | 0 erreur |
| Vitest — unitaires + intégration sur PostgreSQL réel (6 fichiers) | 78 / 78 réussis |
| Playwright — navigateur Chromium, build de production (5 parcours) | 5 / 5 réussis |
| Exploration automatique (`npm run qa:crawl`) — 5 rôles, build de production | 439 pages/liens, 0 problème |
| Accès sans session / session falsifiée (pages, exports, PDF, justificatifs) | redirection connexion / 401 |
| En-têtes de sécurité (CSP, HSTS, X-Frame-Options, nosniff…) sur le build de production | présents |
| Exercice sauvegarde → restauration sur base vierge | tables et totaux identiques, schéma à jour |
| `npm audit --omit=dev` | 0 alerte après montée de version (voir §4) |

## 3. Problèmes corrigés pendant l'audit

| Gravité | Problème | Correction |
|---|---|---|
| Critique | Le seed créait l'administrateur avec un mot de passe par défaut publié dans la documentation | Plus aucun mot de passe par défaut ; `npm run admin:create` génère un mot de passe provisoire affiché une fois ; changement imposé à la 1re connexion |
| Critique | En production, les formulaires qui redirigent (création d'élève, de groupe, encaissement, correction…) ne changeaient pas de page (squelette de chargement global incompatible) | Squelette global retiré, indicateur de chargement sur les liens ; vérifié par Playwright sur le build de production |
| Élevé | Données de démonstration (comptes au mot de passe connu) injectables en production | Refusées si `NODE_ENV=production` ; avertissement administrateur tant qu'il en reste |
| Moyen | Pas de limitation des tentatives de connexion par poste | 20 tentatives / 15 min par IP, en plus du verrouillage par compte ; changement de mot de passe limité |
| Moyen | Pas d'en-têtes de sécurité | CSP, HSTS, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy |
| Moyen | Session prolongeable indéfiniment | Durée absolue de 7 jours (en plus des 12 h d'inactivité) |
| Moyen | Mot de passe provisoire non imposé aux comptes créés par l'administrateur | Changement obligatoire, appliqué aux pages, actions et API |
| Faible | Journaux d'erreurs complets (valeurs de requêtes, données personnelles possibles) | Journal abrégé, e-mails et numéros masqués (testé) |
| Faible | Enseignants / lecture seule voyaient adresses et e-mails des parents | Réservés à l'administration ; téléphone du parent et remarques médicales conservés pour la sécurité |
| Faible | Liens vers les groupes affichés au comptable sans droit d'accès | Affichés en texte simple |
| Faible | Saisie perdue en cas de coupure réseau pendant l'envoi d'un formulaire | Message clair, saisie conservée |
| Faible | Listes d'identifiants non bornées dans les actions groupées | Limitées (200–500) |

## 4. Risques et limitations restants

- **Dépendances — corrigé (29/10/2026)** : les 8 alertes `npm audit --omit=dev` (Next via PostCSS, Prisma via
  `@prisma/config`/deepmerge-ts, exceljs via uuid, Zod) sont résolues par les montées de version majeures
  Next 15.5 → 16.4.1, Prisma 6.19 → 7.10.1 (avec l'adaptateur `@prisma/adapter-pg`, configuration dans `prisma.config.ts`),
  Zod 3 → 4.6.7, et uuid forcé en 11.1.1 sous exceljs 4.4.0 (dernière version publiée ; `overrides` dans `package.json`).
  Résultat : `npm audit --omit=dev` → 0 vulnérabilité. Toutes les vérifications du §2 ont été rejouées après la montée
  (lint, TypeScript, 78/78 Vitest, 5/5 Playwright sur le build de production, `qa:crawl` 439 pages / 0 problème, en-têtes
  de sécurité). Adaptations : `middleware.ts` → `proxy.ts` (Next 16), limite du corps de requête du proxy portée à 16 Mo
  (sinon tronquée à 10 Mo avant les Server Actions), configuration ESLint native de Next 16.
  Restent 3 alertes **de développement uniquement** (vitest 3 : tinypool, `@vitest/mocker`), non déployées ; correction
  par vitest 5 (majeure) à planifier.
  Node.js requis : ≥ 20.19 (Prisma 7).
- **Déploiement réel non testé** : les fichiers `deploy/` (systemd, nginx, cron) et la procédure n'ont pas été exécutés sur un serveur.
- **Limitation des tentatives en mémoire** : valable pour une seule instance ; remise à zéro au redémarrage.
- **CSP avec `'unsafe-inline'`** pour les scripts (exigence de Next.js sans nonce) : protection XSS partielle, compensée par
  l'échappement systématique de React (aucun HTML injecté).
- **Historique Git** : les deux premiers commits publiés contiennent l'ancien mot de passe par défaut dans la documentation.
  Il n'est plus utilisé par aucun code ; ne jamais l'employer pour un compte réel.
- **Pas d'envoi SMS/WhatsApp/e-mail** (volontaire), pas de PDF serveur pour les documents autres que les reçus (impression navigateur).
- **Rémunérations** attribuées à l'enseignant actuel du groupe ; **logo** en basse résolution.
- **Accessibilité** : objectif WCAG 2.2 AA appliqué à la conception (contrastes ≥ 4,5:1, focus visible, cibles 44 px,
  libellés et erreurs reliés aux champs, dialogues natifs à focus piégé, lien d'évitement, zoom autorisé), vérifié par les
  tests Playwright et des contrôles manuels ; **pas encore audité avec un outil dédié** (axe, lecteur d'écran réel).

## 4 bis. Refonte UI/UX mobile-first (30/10/2026)

Détail : `docs/REFONTE_UI.md` (audit avant travaux, système de design, stratégie responsive par module).
Aucune migration, aucune modification des règles métier, des permissions serveur, des montants (millimes) ni des journaux d'audit.

| Vérification | Résultat |
|---|---|
| ESLint, TypeScript | 0 erreur, 0 avertissement |
| Vitest (PostgreSQL `vamos_gestion_test`) | 78 / 78 |
| Playwright, build de production, base `vamos_e2e_test` | 9 / 9 (5 existants + 4 nouveaux, voir ci-dessous) |
| `npm run build` | réussi |
| `qa:crawl` (`next start -p 3100`, base `vamos_gestion`, `COOKIE_SECURE=false`) | 427 pages/liens, 5 rôles, 0 problème |

Nouveaux tests Playwright (`e2e/responsive.spec.ts`) : ~40 routes (listes, fiches, formulaires, documents imprimables) sans
défilement horizontal à 320, 390 et 768 px, pages principales à 360, 375, 430, 1024, 1280 et 1440 px ; menu, recherche,
filtres repliés, modification d'un dossier dans une feuille et confirmation en feuille basse sur téléphone ; appel puis
encaissement sur téléphone ; onglets et refus d'accès pour chacun des 5 rôles.
Problèmes trouvés et corrigés pendant ces contrôles : débordements à 320 px (paramètres, utilisateurs, bulletin) ;
lien « Rapports » du tableau de bord affiché au rôle Responsable sans droit d'accès ; le crawler suivait sans fin les liens
« veille / lendemain » des présences (dates désormais regroupées par forme d'URL).

Limites connues de la refonte :
- Contrôles sur navigateur Chromium (émulation de largeur et de toucher) ; **non testé sur iPhone/Safari ni sur un appareil réel**.
- Le relevé de notes et les grandes grilles imprimables (feuille de présence) restent des tableaux défilant dans leur cadre
  sur téléphone (données réellement tabulaires).
- Pas de mode sombre ; pas de vue « salles » séparée (occupation affichée dans *Groupes, salles & cours* et sur le tableau de bord).
- Réinscription en masse vers une nouvelle année toujours non disponible (signalée dans les paramètres).
- Logo source en basse résolution (244 × 128 px).

## 5. Lancer et déployer

- Local : `README.md` § « Démarrage local ».
- Production : `docs/DEPLOIEMENT.md` (serveur, base, `admin:create`, HTTPS, sauvegardes, restauration, mise à jour, liste de contrôle).
- Utilisateurs : `docs/GUIDE_UTILISATEUR.md`.
