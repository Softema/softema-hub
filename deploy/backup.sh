#!/usr/bin/env bash
# Daily backup of the production database (schema "hub") on the VPS, i.e. outside Supabase where the data lives.
# Runs from /etc/cron.d/softema-hub-backup (docs/NASAZENI.md). Keeps BACKUP_KEEP_DAYS (default 14) days.
# A failure is e-mailed to ALERT_EMAIL through Resend when both are set in deploy/.env. No secret is printed or put on
# a command line: the database URL reaches the pg_dump container through --env-file.
set -euo pipefail
cd "$(dirname "$0")"
DIR=${BACKUP_DIR:-/var/backups/softema-hub}
KEEP=${BACKUP_KEEP_DAYS:-14}
env_value() { grep -m1 "^$1=" .env | cut -d= -f2- || true; }

alert() {
  local to key from
  to=$(env_value ALERT_EMAIL); key=$(env_value RESEND_API_KEY); from=$(env_value MAIL_FROM)
  [ -n "$to" ] && [ -n "$key" ] || return 0
  curl -fsS --max-time 20 https://api.resend.com/emails -H "Authorization: Bearer $key" -H 'Content-Type: application/json' \
    --data @- >/dev/null <<JSON || true
{"from":"${from:-Softema Hub <hub@mail.softema.cz>}","to":["$to"],"subject":"Softema Hub: záloha databáze selhala","text":"Noční záloha databáze Softema Hub na serveru $(hostname) selhala $(date -u '+%d. %m. %Y %H:%M') UTC.\nPodrobnosti: /var/log/softema-hub-backup.log na serveru."}
JSON
}
trap 'echo "$(date -u +%FT%TZ) CHYBA zálohy"; alert' ERR

mkdir -p "$DIR"; chmod 700 "$DIR"
file="$DIR/softema-hub-$(date -u +%Y%m%d-%H%M).dump"
docker run --rm --network host --env-file <(grep -m1 '^DATABASE_OWNER_URL=' .env) \
  -v "$PWD/supabase-ca.crt:/etc/softema/supabase-ca.crt:ro" postgres:17-alpine \
  sh -c 'pg_dump "$DATABASE_OWNER_URL" --format=custom --schema=hub' > "$file.part"
# A dump that pg_restore cannot list is not a backup.
docker run --rm -i postgres:17-alpine pg_restore --list < "$file.part" > /dev/null
mv "$file.part" "$file"; chmod 600 "$file"
find "$DIR" -name 'softema-hub-*.dump' -mtime +"$KEEP" -delete
find "$DIR" -name '*.part' -mmin +60 -delete
echo "$(date -u +%FT%TZ) OK $(basename "$file") $(du -h "$file" | cut -f1)"
