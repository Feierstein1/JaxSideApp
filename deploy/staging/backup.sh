#!/usr/bin/env bash
# D139: nightly database backup to S3 (kept 14 days by the bucket's lifecycle rule).
# Run by cron (deploy/staging/cron). Restore: docs/OPERATIONS.md §3.
set -euo pipefail
cd /opt/jaxside
set -a; . ./.env; set +a
STAMP=$(date -u +%Y-%m-%dT%H%MZ)
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc \
  | docker run --rm -i -e AWS_ACCESS_KEY_ID="$S3_ACCESS_KEY" -e AWS_SECRET_ACCESS_KEY="$S3_SECRET_KEY" \
      -e AWS_DEFAULT_REGION="$S3_REGION" amazon/aws-cli:2.31.6 \
      s3 cp - "s3://$S3_BUCKET_BACKUPS/db/jax_staging-$STAMP.dump" --only-show-errors
echo "backup ok $STAMP"
