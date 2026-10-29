# Déploiement sur Vercel + base PostgreSQL Neon

Architecture retenue : **une seule application Next.js sur Vercel** (pages, Server Actions et API dans la même
application : aucun « web service » séparé à héberger) + **une base PostgreSQL managée Neon**, créée depuis Vercel.

| Élément | Où | Région |
|---|---|---|
| Application (pages, actions, API, PDF, exports) | Vercel, projet relié au dépôt GitHub | `fra1` (Francfort, fixée dans `vercel.json`) |
| Base PostgreSQL | Neon, via *Vercel → Storage* (intégration Marketplace) | AWS Europe Central 1 (Francfort) |
| Justificatifs de dépenses (PDF, JPG, PNG) | dans la base (table `AttachmentContent`) | — |
| Limitation des tentatives de connexion | dans la base (table `RateLimit`) | — |

Francfort est la région la plus proche de la Tunisie chez les deux fournisseurs ; l'application et la base doivent être
dans la **même** région (chaque page fait plusieurs requêtes SQL).

Ce qui a été préparé dans le code pour Vercel (testé en local, voir §8) :
- pas de disque persistant sur Vercel → justificatifs stockés en base, servis après contrôle des droits ;
- plusieurs instances éphémères → limitation des tentatives en base, petit pool de connexions par instance ;
- requêtes limitées à 4,5 Mo par Vercel → 4 Mo de justificatifs par envoi ; les photos prises au téléphone sont
  allégées automatiquement dans le navigateur avant l'envoi ;
- `postinstall: prisma generate`, migrations appliquées au build **de production uniquement** (`scripts/vercel-build.mjs`) ;
- le build n'a pas besoin de la base ; le logo des reçus PDF est embarqué dans la fonction.

## 1. Prérequis

- Le code sur GitHub (`SwekiBassem98/VamosAcademy-Logistics`, branche `main`) avec les dernières modifications.
- Un compte Vercel (offre *Hobby* gratuite pour essayer ; **Pro** recommandée pour un usage professionnel : l'offre Hobby
  est réservée à un usage non commercial).
- Node.js ≥ 20.19 et le dépôt cloné sur votre ordinateur (pour créer l'administrateur, §5).

## 2. Créer le projet Vercel

1. <https://vercel.com/new> → **Import Git Repository** → choisir `VamosAcademy-Logistics` (autoriser l'accès GitHub si demandé).
2. *Framework Preset* : **Next.js** (détecté). Ne rien changer aux commandes : `vercel.json` fixe le build
   (`npm run vercel-build`) et la région.
3. Ne pas ajouter de variable d'environnement à la main pour l'instant. Cliquer **Deploy** : ce premier déploiement
   **échoue** (pas encore de base) — c'est normal, il crée le projet.

## 3. Créer la base Neon et la relier

1. Dans le projet Vercel : onglet **Storage** → **Create Database** → **Neon** (*Serverless Postgres*) → **Continue**.
2. Région : **AWS Europe Central 1 (Frankfurt)**. Offre : *Free* pour démarrer (0,5 Go, largement suffisant au début ;
   passer à une offre payante pour un historique de restauration plus long, voir §7).
3. Nom : `vamos-gestion`. **Connect** au projet, environnements : cocher **Production** (et **Preview** seulement si vous
   activez une branche Neon séparée pour les prévisualisations — ne jamais pointer les prévisualisations sur la base de production).
4. Vercel ajoute automatiquement les variables, notamment :
   - `DATABASE_URL` : connexion **poolée** (utilisée par l'application) ;
   - `DATABASE_URL_UNPOOLED` : connexion directe (utilisée par les migrations).

Aucune autre variable n'est nécessaire. **Ne jamais définir** `DEV_ADMIN_PASSWORD`, `SEED_DEMO` ni `COOKIE_SECURE`
en production (HTTPS est fourni par Vercel ; le cookie de session reste `Secure`).

## 4. Déployer

Projet → **Deployments** → dernier déploiement → **⋯ → Redeploy**. Le build de production :
1. applique les migrations (`prisma migrate deploy` sur `DATABASE_URL_UNPOOLED`) ;
2. construit l'application.

Vérifier : `https://<votre-projet>.vercel.app/api/health` → `{"status":"ok"}`.

Ensuite, **chaque `git push` sur `main`** redéploie la production (migrations comprises). Les autres branches créent des
déploiements de prévisualisation, **sans** migration.

## 5. Référentiel et premier administrateur (depuis votre ordinateur, une seule fois)

Récupérer l'URL **directe** : Vercel → Storage → `vamos-gestion` → *.env.local* / *Quickstart* → `DATABASE_URL_UNPOOLED`
(ou console Neon → *Connection details*, case *Connection pooling* décochée). Puis, dans le dossier du dépôt :

```bash
export DATABASE_URL="postgresql://…neon.tech/neondb?sslmode=require"   # URL directe, jamais dans un fichier committé
NODE_ENV=production npm run db:seed          # niveaux, matières, salles, moyens de paiement, modèles de messages
npm run admin:create -- --email direction@vamos-academy.tn --name "Prénom Nom"
unset DATABASE_URL
```

`admin:create` affiche **une seule fois** un mot de passe provisoire ; il devra être changé à la première connexion.
Les autres comptes se créent ensuite dans *Utilisateurs*. Ne **jamais** lancer `db:seed:demo` sur cette base.

## 6. Nom de domaine (facultatif)

Projet → **Settings → Domains** → ajouter `gestion.vamos-academy.tn` → créer chez votre registraire l'enregistrement DNS
indiqué par Vercel (CNAME `cname.vercel-dns.com` pour un sous-domaine). Le certificat HTTPS est automatique.

## 7. Sauvegardes et restauration

- **Neon** garde un historique permettant de restaurer la base à un instant passé (*Restore*, durée selon l'offre :
  courte sur l'offre gratuite). Les justificatifs étant dans la base, ils sont restaurés avec elle.
- **En plus**, faire une sauvegarde hors de Neon (recommandé chaque semaine, et **avant** toute mise à jour importante) :

```bash
DATABASE_URL="<URL directe>" BACKUP_DIR=~/Sauvegardes/vamos ./scripts/backup.sh    # pg_dump compressé + rotation
```

  Le client `pg_dump` doit être en version ≥ celle du serveur Neon (`brew install postgresql@17` sur Mac).
  Les sauvegardes contiennent des données personnelles d'élèves mineurs : les chiffrer (`gpg --symmetric`) et en limiter l'accès.
- Restauration dans une base vide (ex. nouvelle branche Neon) :
  `gunzip -c vamos-AAAAMMJJ-HHMMSS.sql.gz | psql "<URL directe>" -v ON_ERROR_STOP=1`.

## 8. Ce qui a été vérifié avant livraison (30/10/2026, en local)

- `npm run vercel-build` avec `VERCEL_ENV=preview` (migrations ignorées) et `VERCEL_ENV=production` (migrations appliquées) ;
- build sans `DATABASE_URL` ; logo présent dans la trace de la fonction PDF ;
- application lancée avec `VERCEL=1` (pool serverless) : `qa:crawl` 5 rôles, 427 pages/liens, 0 problème ;
- Vitest 80/80 (dont stockage des justificatifs en base et limitation partagée), Playwright 10/10 sur le build de production
  (dont l'envoi d'une photo de 4 Mo+ allégée automatiquement, et le refus d'un PDF trop lourd sans perte de saisie).

**Non vérifié** : un déploiement réel sur Vercel/Neon (nécessite vos comptes). Après le premier déploiement, contrôler :
`/api/health`, connexion, enregistrement d'une dépense avec justificatif puis ouverture du fichier, impression d'un reçu PDF.

## 9. Limites connues sur Vercel

- **Justificatifs** : 4 Mo par envoi (plusieurs envois possibles pour une même dépense). Les PDF ne sont pas compressés.
- **Fonctions** : démarrage à froid possible (première page après une période d'inactivité un peu plus lente).
- **CSP** : la barre d'outils Vercel des prévisualisations est bloquée par la politique de sécurité (sans effet sur l'application).
- **Taille de la base** : surveiller l'espace dans Neon (les justificatifs y sont stockés) ; 0,5 Go sur l'offre gratuite.
