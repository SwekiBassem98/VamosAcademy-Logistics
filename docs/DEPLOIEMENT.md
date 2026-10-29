# Déploiement, sauvegarde, restauration et mise à jour

Cible recommandée : un serveur Linux (Ubuntu 24.04 LTS) avec Node.js 20 LTS (≥ 20.19), PostgreSQL 16, nginx et un nom de domaine
(ex. `gestion.vamos-academy.tn`). Une seule instance de l'application (la limitation des tentatives de connexion est en mémoire).

> Les fichiers prêts à l'emploi sont dans `deploy/` : `vamos.service` (systemd), `nginx-vamos.conf`, `vamos-backup.cron`.
> Ces fichiers n'ont **pas** été testés sur un serveur réel lors du développement ; seules les étapes marquées ✅ ont été exécutées.

## 1. Préparer le serveur

```bash
sudo apt update && sudo apt install -y postgresql nginx certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt install -y nodejs
sudo timedatectl set-timezone Africa/Tunis
sudo useradd --system --create-home --home-dir /opt/vamos vamos
sudo mkdir -p /var/lib/vamos/storage /var/backups/vamos && sudo chown -R vamos:vamos /var/lib/vamos /var/backups/vamos
sudo chmod 750 /var/lib/vamos/storage /var/backups/vamos
```

Pare-feu : n'ouvrir que 22, 80 et 443 (`sudo ufw allow OpenSSH && sudo ufw allow 'Nginx Full' && sudo ufw enable`).
PostgreSQL ne doit écouter que sur `localhost` (valeur par défaut).

## 2. Base de données (utilisateur dédié, sans droits superutilisateur)

```bash
sudo -u postgres psql -c "CREATE ROLE vamos LOGIN PASSWORD 'MOT_DE_PASSE_FORT';"
sudo -u postgres psql -c "CREATE DATABASE vamos_gestion OWNER vamos;"
```

## 3. Installer l'application

```bash
sudo -u vamos -i
git clone https://github.com/SwekiBassem98/VamosAcademy-Logistics.git /opt/vamos/app && cd /opt/vamos/app
cp .env.example .env && chmod 600 .env      # renseigner DATABASE_URL, STORAGE_DIR, BACKUP_DIR
npm ci
npx prisma migrate deploy                   # crée les tables (✅ testé en local)
npm run db:seed                             # référentiel : niveaux, matières, salles, moyens de paiement, modèles (✅)
npm run build                               # (✅)
```

**Ne jamais lancer `npm run db:seed:demo` en production** : il est refusé quand `NODE_ENV=production`.
Si des données de démonstration existent, l'administrateur voit un avertissement sur le tableau de bord ; les supprimer dans
*Paramètres → Données de démonstration*.

## 4. Créer le premier administrateur (procédure sécurisée)

```bash
cd /opt/vamos/app
npm run admin:create -- --email direction@vamos-academy.tn --name "Prénom Nom"   # (✅ testé)
```

Le script génère un mot de passe provisoire de 18 caractères, l'affiche **une seule fois** dans le terminal (aucun fichier,
aucun journal) et impose son changement à la première connexion. Il n'existe aucun compte ni mot de passe par défaut.
Transmettre le mot de passe provisoire en main propre ; les autres comptes se créent ensuite dans *Utilisateurs*
(mot de passe provisoire, changement forcé à la première connexion).

## 5. Service et HTTPS

```bash
sudo cp deploy/vamos.service /etc/systemd/system/ && sudo systemctl daemon-reload && sudo systemctl enable --now vamos
sudo cp deploy/nginx-vamos.conf /etc/nginx/sites-available/vamos && sudo ln -s /etc/nginx/sites-available/vamos /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d gestion.vamos-academy.tn
curl -s https://gestion.vamos-academy.tn/api/health          # → {"status":"ok"}
```

L'application écoute uniquement sur `127.0.0.1:3000` : seul nginx y accède (l'en-tête `X-Real-IP` posé par nginx sert à la
limitation des tentatives de connexion et ne doit pas pouvoir être fourni directement par un client).
HTTPS est obligatoire : le cookie de session est `Secure`, `HttpOnly`, `SameSite=Lax`. En-têtes envoyés : CSP, HSTS,
`X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`, `Permissions-Policy` (✅ vérifiés sur le build de production).

## 6. Sauvegardes

`scripts/backup.sh` produit chaque nuit un dump PostgreSQL compressé **et** une archive des justificatifs, avec rotation
(`KEEP_DAYS`, 30 jours par défaut).

```bash
sudo cp deploy/vamos-backup.cron /etc/cron.d/vamos-backup
```

Copier régulièrement `/var/backups/vamos` **hors du serveur** (autre machine, stockage chiffré) : une sauvegarde sur le même
disque ne protège pas d'une panne matérielle. Les sauvegardes contiennent des données personnelles d'élèves mineurs :
accès restreint, chiffrement recommandé (ex. `gpg --symmetric`).

## 7. Restauration (✅ exercice réalisé : base restaurée identique à la source)

```bash
sudo systemctl stop vamos
sudo -u postgres psql -c "DROP DATABASE vamos_gestion;" -c "CREATE DATABASE vamos_gestion OWNER vamos;"
gunzip -c /var/backups/vamos/vamos-AAAAMMJJ-HHMMSS.sql.gz | sudo -u vamos psql -v ON_ERROR_STOP=1 -d vamos_gestion
sudo -u vamos tar -xzf /var/backups/vamos/vamos-AAAAMMJJ-HHMMSS-justificatifs.tar.gz -C /var/lib/vamos
cd /opt/vamos/app && sudo -u vamos npx prisma migrate status    # doit indiquer « Database schema is up to date »
sudo systemctl start vamos && curl -s https://gestion.vamos-academy.tn/api/health
```

Conseil : tester une restauration chaque trimestre sur une base séparée (`vamos_restore_test`) plutôt que sur la production.

## 8. Mise à jour de l'application

```bash
cd /opt/vamos/app
sudo -u vamos ./scripts/backup.sh                 # 1. sauvegarde AVANT toute mise à jour
sudo -u vamos git pull
sudo -u vamos npm ci
sudo -u vamos npx prisma migrate deploy           # 2. migrations (jamais « migrate dev » ni « migrate reset » en production)
sudo -u vamos npm run build
sudo systemctl restart vamos
curl -s https://gestion.vamos-academy.tn/api/health   # 3. vérification
```

Mise à jour « refonte UI mobile-first » (30/10/2026) : aucune migration de base, aucune nouvelle variable d'environnement.
La procédure ci-dessus suffit (`npm ci` récupère les mêmes dépendances ; la police de titres Plus Jakarta Sans est téléchargée
au moment du build par `next/font`, comme Inter : le serveur de build doit avoir accès à Internet, le serveur d'exécution non).
Après le redémarrage, vider le cache du navigateur n'est pas nécessaire (fichiers statiques versionnés).

En cas d'échec : `git checkout <version précédente>`, `npm ci && npm run build`, puis restauration de la sauvegarde si une
migration a été appliquée.

## 9. Journaux et supervision

- Journaux applicatifs : `journalctl -u vamos -f`. Les erreurs serveur sont écrites sous forme abrégée (type, code, première
  ligne, adresses e-mail et numéros masqués) : ni mot de passe, ni jeton, ni données de requête.
- Journal fonctionnel : *Journal d'audit* dans l'application (connexions, créations, modifications, annulations, exports).
- Supervision : interroger `/api/health` (200 = application et base disponibles, 503 = base indisponible).

## 10. Liste de contrôle avant ouverture

- [ ] HTTPS actif, redirection 80 → 443
- [ ] `.env` en `chmod 600`, propriétaire `vamos` ; aucune variable `DEV_*` définie
- [ ] Premier administrateur créé via `npm run admin:create`, mot de passe changé
- [ ] Aucune donnée de démonstration (pas d'avertissement sur le tableau de bord)
- [ ] Logo officiel HD placé dans `public/brand/logo.png`
- [ ] Paramètres du centre, année scolaire, grille tarifaire, moyens de paiement et réductions vérifiés
- [ ] Interface vérifiée sur un téléphone réel du centre (connexion, appel, encaissement) et sur le poste d'accueil
- [ ] Sauvegarde nocturne active et copie hors serveur organisée ; restauration testée
