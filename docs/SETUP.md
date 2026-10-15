# Local development setup

## Prerequisites

- Node.js 22+ and npm 10+
- Docker Desktop (WSL2 backend on Windows), engine running
- For the mobile app: Expo Go or an Expo dev build on a device/emulator (see PROJECT_PLAN Q8)

## First run

```sh
# 1. Environment: copy the example and fill in real local values.
cp .env.example .env
#    Generate secrets, e.g.:
#    node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
#    Keep POSTGRES_PASSWORD and the password inside DATABASE_URL / TEST_DATABASE_URL identical.

# 2. Install dependencies (also generates the Prisma client).
npm install

# 3. Start local services: PostGIS (5433), SeaweedFS S3 (8333), Mailpit (SMTP 1025, UI 8025).
npm run services:up

# 4. Create the schema and seed config + dev data (idempotent).
npm run db:migrate -w @jax/server
npm run db:seed -w @jax/server

# 5. Start the server (API + future admin portal) on http://localhost:3000.
npm run dev
#    Check: http://localhost:3000/api/v1/health -> {"status":"ok","database":"ok"}

# 6. Start the mobile app (separate terminal).
npm run dev:mobile
```

**Dev accounts:** if `SEED_DEV_PASSWORD` is set in `.env`, the seed creates `dev_alice` (verified),
`dev_bob` (unverified) and `dev_admin` (ADMIN role, verified), all with that password. Leave it empty
to skip them. Dev email (verification and reset links) shows up in Mailpit at http://localhost:8025.

On a physical device, `localhost` is the phone itself. Set the server's LAN address in
`apps/mobile/.env`: `EXPO_PUBLIC_API_URL=http://<your-computer-ip>:3000`. Never put a secret in an
`EXPO_PUBLIC_*` variable, because these values are bundled into the app.

## Services

| Service  | Purpose                                  | Address                    |
| -------- | ---------------------------------------- | -------------------------- |
| postgres | PostGIS 17 / 3.5, `jax_dev` + `jax_test` | `localhost:5433`           |
| s3       | SeaweedFS S3 API (private)               | `http://localhost:8333`    |
| mailpit  | Catches all dev email                    | UI `http://localhost:8025` |

All ports bind to `127.0.0.1` only. Port 5432 was already in use on the dev machine, so Postgres
is on 5433 (`POSTGRES_PORT`).

`npm run services:down` stops the services and keeps their data. Run `docker compose down -v` to
also delete the data volumes.

## Database workflow

- Change `apps/server/prisma/schema.prisma`, then run `npm run db:migrate -w @jax/server`.
- Geography columns are `Unsupported(...)` in Prisma and are written with parameterized raw SQL.
- CHECK constraints are hand-written at the end of migrations. Prisma doesn't track them, so
  they survive future `migrate dev` runs. Add new ones to the migration that introduces the table.

## Troubleshooting

- **A web page keeps reloading itself in dev** (seen once on `/verify-email`, 2026-10-15): the dev
  server got stuck pushing a "reload" to every page it served. Restarting it (`Ctrl+C`, then
  `npm run dev`) cleared it. It could not be reproduced on a fresh server, with several tabs, or
  with Expo running. If it happens again, keep the terminal output and
  `apps/server/.next/dev/logs/next-development.log` before restarting.
- **The phone says "Could not reach the server"**: phone and computer must be on the same Wi-Fi,
  `apps/mobile/.env` must hold the computer's Wi-Fi IP, and Windows Firewall must allow Node.js
  (a Wi-Fi network marked "Public" blocks incoming connections).
- **Tests say the database is not reachable**: start Docker Desktop, then `npm run services:up`.
- **A web page opened from the phone does nothing when you press a button**: Next's dev server
  only serves its scripts to allowed hosts. `next.config.ts` allows this computer's private Wi-Fi
  addresses automatically. If your network uses another range, add the address to
  `allowedDevOrigins`. The server log shows "Blocked cross-origin request" when this happens.
- **After a database migration, new API calls fail with "Something went wrong"**: restart
  `npm run dev`. A dev server that was running during the migration can keep old code and an old
  database client in memory. `db.ts` now replaces the client when it's regenerated, but a restart
  is the reliable fix.
