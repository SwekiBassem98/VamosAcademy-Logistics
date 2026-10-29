#!/usr/bin/env bash
# Sauvegarde PostgreSQL compressée avec rotation (par défaut 30 jours).
# Usage : DATABASE_URL=... BACKUP_DIR=/chemin ./scripts/backup.sh
# Cron quotidien (2 h, heure de Tunis) : 0 2 * * * cd /app && ./scripts/backup.sh >> backup.log 2>&1
# Restauration : gunzip -c fichier.sql.gz | psql "$DATABASE_URL" (justificatifs compris) ; anciens fichiers : tar -xzf fichier-justificatifs.tar.gz -C <parent de STORAGE_DIR>
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL manquant}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${KEEP_DAYS:-30}"
URL="${DATABASE_URL%%\?*}" # pg_dump n'accepte pas ?schema=

mkdir -p "$BACKUP_DIR"
FILE="$BACKUP_DIR/vamos-$(TZ=Africa/Tunis date +%Y%m%d-%H%M%S).sql.gz"
pg_dump --no-owner --no-privileges "$URL" | gzip -9 > "$FILE"
echo "Base : $FILE ($(du -h "$FILE" | cut -f1))"

# Anciens justificatifs restés sur disque (avant le stockage en base)
STORAGE_DIR="${STORAGE_DIR:-./storage}"
if [ -d "$STORAGE_DIR" ]; then
  FILES="${FILE%.sql.gz}-justificatifs.tar.gz"
  tar -czf "$FILES" -C "$(dirname "$STORAGE_DIR")" "$(basename "$STORAGE_DIR")"
  echo "Justificatifs : $FILES ($(du -h "$FILES" | cut -f1))"
fi
find "$BACKUP_DIR" -name 'vamos-*.gz' -mtime +"$KEEP_DAYS" -delete
echo "Sauvegarde OK"
