#!/usr/bin/env bash
# Restore test (Softema standard, "Zálohy a obnova"): loads the newest backup into a throwaway PostgreSQL container
# without network access and compares row counts per table with production. Nothing in production changes.
set -euo pipefail
cd "$(dirname "$0")"
DIR=${BACKUP_DIR:-/var/backups/softema-hub}
dump=$(ls -1t "$DIR"/softema-hub-*.dump | head -1)
name=softema-restore-check
counts="select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) c from hub.%I', table_name), false, true, '')))[1]::text::int from information_schema.tables where table_schema = 'hub' and table_type = 'BASE TABLE' order by 1"

docker rm -f "$name" >/dev/null 2>&1 || true
docker run -d --name "$name" --network none -e POSTGRES_PASSWORD=restore-check-only postgres:17-alpine >/dev/null
trap 'docker rm -f "$name" >/dev/null' EXIT
until [ "$(docker logs "$name" 2>&1 | grep -c 'ready to accept connections')" -ge 2 ]; do sleep 1; done
# What Supabase and the migrations provide outside the "hub" schema.
docker exec "$name" psql -q -v ON_ERROR_STOP=1 -U postgres -c "create schema extensions; create extension unaccent schema extensions; create extension pg_trgm schema extensions; create role hub_app; create role hub_auth; create role anon; create role authenticated; create role service_role;"
docker exec -i "$name" pg_restore -U postgres -d postgres --no-owner --exit-on-error < "$dump"

echo "Záloha: $(basename "$dump")"
docker exec "$name" psql -U postgres -At -F ' ' -c "$counts" > /tmp/softema-restored.txt
docker run --rm --network host --env-file <(grep -m1 '^DATABASE_OWNER_URL=' .env) \
  -v "$PWD/supabase-ca.crt:/etc/softema/supabase-ca.crt:ro" postgres:17-alpine \
  sh -c "psql \"\$DATABASE_OWNER_URL\" -At -F ' ' -c \"$counts\"" > /tmp/softema-production.txt
echo "tabulka obnoveno produkce"
join /tmp/softema-restored.txt /tmp/softema-production.txt | column -t
rm -f /tmp/softema-restored.txt /tmp/softema-production.txt
