#!/usr/bin/env bash
# D139: nightly database backup to S3 (kept 14 days by the bucket's lifecycle rule).
# Run by cron (deploy/staging/cron). Restore: docs/OPERATIONS.md §3.
set -euo pipefail
cd /opt/jaxside
set -a; . ./.env; set +a
STAMP=$(date -u +%Y-%m-%dT%H%MZ)

# D275: each run is recorded for the dashboard and its alerts ("JobRun"). Recording never
# changes the backup's own result.
record() {
  local ok="$1" note
  note=$(printf '%s' "$2" | tr -cd 'A-Za-z0-9 ._:()-' | cut -c1-200)
  printf 'INSERT INTO "JobRun" (job, ok, note) VALUES (%s, %s, %s);\n' \
    "'backup'" "$ok" "'$note'" |
    docker compose exec -T postgres sh -c 'psql -q -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
      >/dev/null 2>&1 || true
}
trap 'record false "backup $STAMP failed (exit $?, line $LINENO)"' ERR

docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
  | docker run --rm -i -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
      -e AWS_DEFAULT_REGION="$S3_REGION" amazon/aws-cli:2.31.6 \
      s3 cp - "s3://$S3_BUCKET_BACKUPS/db/jax_staging-$STAMP.dump" --only-show-errors
record true "jax_staging-$STAMP.dump"
echo "backup ok $STAMP"
