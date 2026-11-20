#!/usr/bin/env bash
# D275: a health snapshot for the admin dashboard, every 10 minutes (deploy/staging/cron):
# memory, disk, load, each container's memory, the database size, whether the app and website
# answer. With --s3 (once a day) also the S3 sizes. Written to "ServerHealthSample"; the app's
# `jobs:health` then checks it and emails alerts. Quiet unless something fails. DRY_RUN=1 prints
# the statement instead of saving it.
set -uo pipefail
cd /opt/jaxside
set -a; . ./.env; set +a

APP_URL="${HEALTH_APP_URL:-https://api.jaxside.com/api/v1/health}"
WEB_URL="${HEALTH_WEB_URL:-https://jaxside.com/}"

kb() { awk -v k="$1" '$1 == k":" { print int($2 / 1024) }' /proc/meminfo; }
mem_total=$(kb MemTotal)
mem_avail=$(kb MemAvailable)
swap_used=$(( $(kb SwapTotal) - $(kb SwapFree) ))
read -r disk_total disk_used < <(df -Pm / | awk 'NR == 2 { print $2, $3 }')
read -r load1 _ load15 _ < /proc/loadavg

up() { curl -fsS -o /dev/null --max-time 10 "$1" >/dev/null 2>&1 && echo true || echo false; }
app_up=$(up "$APP_URL")
web_up=$(up "$WEB_URL")

# "jaxside-app-1|199.8MiB / 3.742GiB" -> {"name":"jaxside-app-1","memMb":200,"limitMb":3832}
to_mb() {
  awk -v v="$1" 'BEGIN {
    n = v + 0; u = v; sub(/^[0-9.]+/, "", u)
    if (u == "KiB" || u == "kB") n /= 1024; else if (u == "GiB" || u == "GB") n *= 1024;
    else if (u == "B") n /= 1048576; printf "%d", n + 0.5 }'
}
containers="["
while IFS='|' read -r name usage; do
  [[ "$name" =~ ^[A-Za-z0-9_.-]+$ ]] || continue
  used=$(to_mb "$(echo "$usage" | awk '{ print $1 }')")
  limit=$(to_mb "$(echo "$usage" | awk '{ print $3 }')")
  [ "$containers" = "[" ] || containers+=","
  containers+="{\"name\":\"$name\",\"memMb\":$used,\"limitMb\":$limit}"
done < <(docker stats --no-stream --format '{{.Name}}|{{.MemUsage}}' 2>/dev/null)
containers+="]"

psql_in() {
  docker compose exec -T postgres sh -c 'psql -q -t -A -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
}
db_bytes=$(echo 'SELECT pg_database_size(current_database());' | psql_in | tr -dc '0-9')
db_bytes=${db_bytes:-0}

s3_cols=""
s3_vals=""
if [ "${1:-}" = "--s3" ]; then
  # "Total Objects: 72" / "Total Size: 25135421"
  s3_size() {
    docker run --rm -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
      -e AWS_DEFAULT_REGION="$S3_REGION" amazon/aws-cli:2.31.6 \
      s3 ls "s3://$1" --recursive --summarize 2>/dev/null |
      awk '/Total Objects:/ { o = $3 } /Total Size:/ { s = $3 } END { printf "%d %d", s + 0, o + 0 }'
  }
  read -r media_bytes media_objects < <(s3_size "$S3_BUCKET_MEDIA")
  read -r backup_bytes backup_objects < <(s3_size "$S3_BUCKET_BACKUPS")
  s3_cols=', "s3MediaBytes", "s3MediaObjects", "s3BackupsBytes", "s3BackupsObjects"'
  s3_vals=", ${media_bytes:-0}, ${media_objects:-0}, ${backup_bytes:-0}, ${backup_objects:-0}"
fi

# Every value above is a number, true/false, or JSON built from checked names.
# DRY_RUN=1 prints the statement instead (to check the script on a server).
if [ "${DRY_RUN:-}" = 1 ]; then psql_in() { cat; }; fi
psql_in <<SQL || { echo "$(date -u +%FT%TZ) health snapshot not saved" >&2; exit 1; }
INSERT INTO "ServerHealthSample" ("memTotalMb", "memAvailableMb", "swapUsedMb", "diskTotalMb",
  "diskUsedMb", "load1", "load15", "dbBytes", "appUp", "webUp", "containers"$s3_cols)
VALUES ($mem_total, $mem_avail, $swap_used, $disk_total, $disk_used, $load1, $load15, $db_bytes,
  $app_up, $web_up, '$containers'::jsonb$s3_vals);
SQL
