#!/usr/bin/env bash
# D139: deploy the committed code to the staging server.
#
#   bash deploy/staging/deploy.sh            # the current commit (must be committed)
#   bash deploy/staging/deploy.sh --env      # also upload deploy/staging/secrets/staging.env
#
# Sends the source (git archive, a few MB), builds the image on the server, applies database
# migrations, adds new settings (seed), and restarts. Takes a few minutes; the old version
# keeps serving while the new image builds.
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"

HOST=ubuntu@34.197.165.101
KEY=~/.ssh/jaxside-staging.pem
SSH="ssh -i $KEY -o ConnectTimeout=20 $HOST"
REV=$(git rev-parse --short HEAD)

if [ -n "$(git status --porcelain -- . ':!scripts/dev-remote.mjs')" ]; then
  echo "Uncommitted changes; commit first (deploys ship the commit, not your working copy)." >&2
  exit 1
fi

echo "Deploying $REV…"
git archive --format=tar HEAD | gzip | $SSH "rm -rf /opt/jaxside/src.new && mkdir -p /opt/jaxside/src.new && tar -xzf - -C /opt/jaxside/src.new && echo $REV > /opt/jaxside/src.new/REVISION"
scp -i "$KEY" -q deploy/staging/docker-compose.yml deploy/staging/Caddyfile deploy/staging/backup.sh deploy/staging/cron "$HOST:/opt/jaxside/"
if [ "${1:-}" = "--env" ]; then
  scp -i "$KEY" -q deploy/staging/secrets/staging.env "$HOST:/opt/jaxside/.env"
  $SSH "chmod 600 /opt/jaxside/.env"
fi

# (Commands that read input get </dev/null, or they'd swallow the rest of this script.)
$SSH bash -s <<'REMOTE'
set -euo pipefail
cd /opt/jaxside
test -f .env || { echo "No /opt/jaxside/.env (run with --env)"; exit 1; }
rm -rf src.old && { [ -d src ] && mv src src.old || true; } && mv src.new src
docker compose build app
docker compose up -d postgres
docker compose run --rm -T app ../../node_modules/.bin/prisma migrate deploy </dev/null
docker compose run --rm -T app ../../node_modules/.bin/prisma db seed </dev/null
docker compose up -d
sudo install -m 644 cron /etc/cron.d/jaxside
chmod 755 backup.sh
docker image prune -f >/dev/null
for i in $(seq 1 30); do
  if docker compose exec -T app node -e "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))" </dev/null; then
    echo "Healthy: $(cat src/REVISION)"; exit 0
  fi
  sleep 2
done
echo "Not healthy yet; check: docker compose logs app"; exit 1
REMOTE
