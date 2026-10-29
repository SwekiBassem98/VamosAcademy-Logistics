# VAMOS ACADEMY — Plateforme de gestion

Application web de gestion du centre de soutien scolaire **VAMOS ACADEMY** (Kelibia, Tunisie) :
élèves, parents, inscriptions, enseignants, groupes, emplois du temps, présences, notes, mensualités, reçus, impayés, dépenses, rapports, utilisateurs et audit.

> Conception, schéma de données, matrice des rôles et plan par étapes : **[docs/PROJECT_BLUEPRINT.md](docs/PROJECT_BLUEPRINT.md)**.

## Démarrage

Prérequis : Node.js ≥ 20, PostgreSQL ≥ 14.

```bash
npm install
cp .env.example .env                 # renseigner DATABASE_URL
npx prisma migrate deploy            # crée / met à jour les tables
npm run db:seed                      # référentiel + compte admin
npm run dev                          # http://localhost:3000
```

- Compte initial : `admin@vamos-academy.tn`, mot de passe = `SEED_ADMIN_PASSWORD` (défaut `ChangezMoi!2026`). **À changer immédiatement** (menu profil → *Mon profil & mot de passe*).
- `npm run db:seed:demo` ajoute des données **fictives** marquées `isDemo` : badge **DÉMO** partout, mention sur les documents imprimés, suppression en un clic dans *Paramètres → Données de démonstration* (administrateur). Il crée aussi un compte de test par rôle : `responsable@`, `comptable@`, `enseignant@`, `lecture@demo.vamos-academy.tn` (mot de passe `Demo2026vamos`), supprimés avec la purge.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` / `build` / `start` | Développement (dossier `.next-dev`) / build / production (dossier `.next`) |
| `npm test` | 71 tests : unitaires + intégration (base `TEST_DATABASE_URL`, nom obligatoirement en `*_test`, vidée à chaque exécution) |
| `npm run typecheck` · `npm run lint` | Vérifications statiques |
| `npx prisma migrate deploy` | Applique les migrations |
| `./scripts/backup.sh` | Sauvegarde `pg_dump` compressée avec rotation |

## Configuration

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | PostgreSQL |
| `STORAGE_DIR` | Dossier des justificatifs de dépenses (défaut `./storage`, hors `public/`) — **à inclure dans les sauvegardes** |
| `SEED_ADMIN_PASSWORD` | Mot de passe initial de l'administrateur (seed) |

Aucun service d'envoi (SMS, WhatsApp, e-mail) n'est branché : les messages sont préparés puis envoyés par l'équipe.

## Conventions

- Interface en français, fuseau `Africa/Tunis`, montants **en millimes** en base (`45,500 DT` = `45500`). Une échéance n'est « en retard » qu'une fois son jour écoulé (heure de Tunis).
- Couches : pages (`src/app`) → Server Actions (`actions.ts` : permission + Zod) → services (`src/server/services`) → Prisma. Permissions vérifiées **côté serveur** ; l'enseignant est restreint à ses groupes (`src/server/scope.ts`).
- Toute action sensible est tracée dans `AuditLog` ; les modifications de dossier élève sont historisées champ par champ.
- Aucune opération financière n'est supprimée : paiements, dépenses, échéances et rémunérations sont **annulés ou corrigés** avec motif, l'original restant consultable. Les élèves sont archivés, pas supprimés.
- Le logo (`public/brand/logo.png`) est extrait d'une capture basse résolution : **remplacer par le fichier officiel HD/SVG**.
