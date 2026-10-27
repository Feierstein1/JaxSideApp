# JaxSide server image (D139): the API, plus the tools the server needs on the box
# (migrations, seed, scheduled jobs, admin promote), all run from this one image.
# Build from the repo root:  docker build -f apps/server/Dockerfile -t jaxside-server .
FROM node:22-bookworm-slim

ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app

# Dependencies first (cached until a package file changes). Only the server and shared
# workspaces; the phone app's packages are skipped.
COPY package.json package-lock.json docker-compose.yml ./
COPY apps/server/package.json apps/server/
COPY apps/mobile/package.json apps/mobile/
COPY packages/shared/package.json packages/shared/
COPY apps/server/prisma apps/server/prisma
COPY apps/server/prisma.config.ts apps/server/
COPY apps/server/src/server/repo-root.ts apps/server/src/server/
RUN npm ci -w @jax/server -w @jax/shared --include-workspace-root --no-audit --no-fund

COPY . .
# The build loads modules that check their settings, so it gets throwaway random ones
# (scripts/build-env.mjs), deleted in the same step. Real settings are mounted at run time.
RUN node apps/server/scripts/build-env.mjs .env \
  && npm run build -w @jax/server \
  && rm .env \
  && chown -R node:node /app/apps/server/.next

USER node
WORKDIR /app/apps/server
EXPOSE 3000
# The settings come from /app/.env (mounted read-only by docker compose).
CMD ["../../node_modules/.bin/next", "start", "-p", "3000", "-H", "0.0.0.0"]
