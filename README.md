# VAMOS ACADEMY — Plateforme de gestion

Application web de gestion du centre de soutien scolaire **VAMOS ACADEMY** (Kelibia, Tunisie) :
élèves, parents, inscriptions, enseignants, groupes, emplois du temps, présences, notes, mensualités, reçus, impayés, dépenses, rapports, utilisateurs et audit.

> Conception, schéma de données, matrice des rôles et plan par étapes : **[docs/PROJECT_BLUEPRINT.md](docs/PROJECT_BLUEPRINT.md)**.

## Démarrage local (développement)

Prérequis : Node.js ≥ 20, PostgreSQL ≥ 14.

```bash
npm install
cp .env.example .env                       # renseigner DATABASE_URL (et DEV_ADMIN_PASSWORD pour un compte local)
npx prisma migrate deploy                  # crée / met à jour les tables
npm run db:seed                            # référentiel (+ compte admin local si DEV_ADMIN_PASSWORD est défini)
npm run db:seed:demo                       # facultatif : données FICTIVES (refusé si NODE_ENV=production)
npm run dev                                # http://localhost:3000
```

- Aucun compte ni mot de passe par défaut. Hors développement, créer l'administrateur avec
  `npm run admin:create -- --email … --name "…"` (mot de passe provisoire généré, changement forcé à la 1re connexion).
- Les données de démonstration sont marquées **DÉMO** et créent un compte de test par rôle (`…@demo.vamos-academy.tn`,
  mot de passe `Demo2026vamos`, **développement uniquement**). Suppression : *Paramètres → Données de démonstration*.

**Déploiement, sauvegarde, restauration, mise à jour : [docs/DEPLOIEMENT.md](docs/DEPLOIEMENT.md).**
**Guide utilisateur (français) : [docs/GUIDE_UTILISATEUR.md](docs/GUIDE_UTILISATEUR.md).**

## Vérifications

| Commande | Rôle |
|---|---|
| `npm run lint` · `npm run typecheck` | Analyse statique |
| `npm test` | Tests unitaires et d'intégration (base `TEST_DATABASE_URL`, nom en `*_test`, **vidée** à chaque exécution) |
| `npm run test:e2e` | Tests navigateur Playwright sur le build de production (base `E2E_DATABASE_URL` en `*_test`, vidée) ; 1re fois : `npx playwright install chromium` |
| `npm run qa:crawl` | Parcours automatique de toutes les pages/liens par rôle (base de démonstration, serveur lancé ; `QA_BASE_URL`) |
| `npm run build` | Build de production |

## Configuration

Voir `.env.example`. Variables principales : `DATABASE_URL`, `STORAGE_DIR` (justificatifs, à sauvegarder), `BACKUP_DIR`,
`KEEP_DAYS`. Aucun service d'envoi (SMS, WhatsApp, e-mail) n'est branché : les messages sont préparés puis envoyés par l'équipe.

## Conventions

- Interface en français, fuseau `Africa/Tunis`, montants **en millimes** en base (`45,500 DT` = `45500`). Une échéance n'est « en retard » qu'une fois son jour écoulé (heure de Tunis).
- Couches : pages (`src/app`) → Server Actions (`actions.ts` : permission + Zod) → services (`src/server/services`) → Prisma. Permissions vérifiées **côté serveur** ; l'enseignant est restreint à ses groupes (`src/server/scope.ts`).
- Toute action sensible est tracée dans `AuditLog` ; les modifications de dossier élève sont historisées champ par champ.
- Aucune opération financière n'est supprimée : paiements, dépenses, échéances et rémunérations sont **annulés ou corrigés** avec motif, l'original restant consultable. Les élèves sont archivés, pas supprimés.
- Le logo (`public/brand/logo.png`) est extrait d'une capture basse résolution : **remplacer par le fichier officiel HD/SVG**.
