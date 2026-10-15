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

On a physical device, `localhost` is the phone itself. Set the server's LAN address in
`apps/mobile/.env`: `EXPO_PUBLIC_API_URL=http://<your-computer-ip>:3000`. Never put a secret in an
`EXPO_PUBLIC_*` variable, because these values are bundled into the app.

## Services

| Service  | Purpose                          | Address                  |
| -------- | -------------------------------- | ------------------------ |
| postgres | PostGIS 17 / 3.5, `jax_dev` + `jax_test` | `localhost:5433`  |
| s3       | SeaweedFS S3 API (private)       | `http://localhost:8333`  |
| mailpit  | Catches all dev email            | UI `http://localhost:8025` |

All ports bind to `127.0.0.1` only. Port 5432 was already in use on the dev machine, so Postgres
is on 5433 (`POSTGRES_PORT`).

`npm run services:down` stops the services and keeps their data. Run `docker compose down -v` to
also delete the data volumes.

## Database workflow

- Change `apps/server/prisma/schema.prisma`, then run `npm run db:migrate -w @jax/server`.
- Geography columns are `Unsupported(...)` in Prisma and are written with parameterized raw SQL.
- CHECK constraints are hand-written at the end of migrations. Prisma doesn't track them, so
  they survive future `migrate dev` runs. Add new ones to the migration that introduces the table.
