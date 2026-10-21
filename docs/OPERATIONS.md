# Operations runbook (P7.4)

How to build the database from nothing, back it up, and restore it. The steps below were
**drilled on 2026-10-16** against the local Docker Postgres (PostGIS 17-3.5): a fresh database
from migrations + seed, and a `pg_dump` of the dev database restored into a new database with
matching row counts and working PostGIS queries.

Production hosting is not chosen yet (Q15, `docs/LAUNCH_SERVICES.md`); the same commands work
against Amazon RDS with its endpoint in `DATABASE_URL`.

## 1. A new database from scratch

```sh
# The database must exist and the user must be allowed to create extensions
# (on RDS the master user can; PostGIS and pg_trgm are created by the first migration).
DATABASE_URL=postgresql://USER:PASS@HOST:5432/DBNAME npx prisma migrate deploy   # in apps/server
DATABASE_URL=...same...                                 npx prisma db seed
```

- `migrate deploy` applies every migration in order (10 as of 2026-10-16). Never use
  `migrate reset` or `migrate dev` against a real database.
- The seed is safe to run again: it adds missing settings, achievements, screening rules and the
  Duval boundary, and **never overwrites** values someone changed. Run it after each deploy so new
  settings get their rows.
- Drill result: 10 migrations, 90 settings, 7 screening rules, 1 service area, PostGIS 3.5.2.
- Then import places: `npm run import:places -w @jax/server` (OpenStreetMap; ~3,700 places).

## 2. Backups

| What                | How                                                                             | Kept                                |
| ------------------- | ------------------------------------------------------------------------------- | ----------------------------------- |
| Database (prod)     | RDS automated backups + point-in-time restore                                   | 7 days (setting)                    |
| Database (extra)    | Weekly `pg_dump -Fc` to a separate, private S3 bucket (or before risky changes) | 4–8 weeks                           |
| Photos              | S3 bucket versioning                                                            | Lifecycle: 30 days for old versions |
| **Encryption keys** | **Offline copy, kept apart from database backups** (`docs/KEY_MANAGEMENT.md`)   | Forever                             |

**Without the master keys, a database backup can't decrypt anyone's email** (D35, R10). Test a
restore with the keys at least once.

Manual dump (any machine that can reach the database):

```sh
pg_dump -Fc -d "$DATABASE_URL" -f jax-$(date +%F).dump
```

Retention note: backups contain data that the app deletes on schedule (location readings after
30 days, crypto-shredded accounts after 30 days, D14/D37). Keep backups no longer than needed
(a few weeks), so deleted data really goes away.

## 3. Restore (as drilled)

```sh
createdb -h HOST -U USER jax_restore
pg_restore -h HOST -U USER -d jax_restore --no-owner jax-YYYY-MM-DD.dump
# check: row counts of User, GeneralPost, BusinessPlace, AppConfiguration, _prisma_migrations
# check: a PostGIS query, e.g. places within a mile of downtown
```

Then point `DATABASE_URL` at the restored database, run `npx prisma migrate deploy` (applies
anything newer than the backup) and restart the server. Drill result: every table's row count
matched, and a PostGIS distance query returned the same 200 places.

**RDS point-in-time restore** creates a _new_ database instance; switch `DATABASE_URL` to it,
then delete the old one once you're happy.

## 4. Scheduled jobs

Two jobs, run from cron on the server:

```sh
# Daily, e.g. 4 am Eastern:            0 4 * * *
npm run jobs:maintenance -w @jax/server
# Every 10 minutes (P13.3):             0,10,20,30,40,50 * * * *
npm run jobs:counters -w @jax/server
```

**Maintenance** deletes old location readings, sessions, email codes and rate-limit counters;
expires and purges guests; removes year-old guest comments; crypto-shreds deleted accounts after
30 days (skipping legal holds); ends finished suspensions; awards time-based medals; deletes unused
photo uploads and expired place changes; and applies the retention rules (D107): notifications,
deleted and removed posts and comments, unsent messages, removed media, location flags, old
installations and resolved contact tickets, never anything with an open report.
Big tables are deleted 5,000 rows at a
time, and each step runs on its own, so a large backlog never becomes one long transaction.

**Counters** removes expired rate-limit counters, which every limited request writes.

**Location history** (`LocationCheck`) is split into one piece per UTC day (P13.6), in the
`jax_partitions` schema. Maintenance creates the next 8 days' pieces and drops whole days older
than 30 days. If maintenance stops running, new readings land in the catch-all piece
`LocationCheck_default` (nothing fails); the next run moves them into their days.

Each job holds its own database lock, so a job never overlaps with itself (a second run just
prints that one is in progress), but the two can run at the same time. If a job crashes, the lock
is released automatically.

## 5. Admin portal on a public server

Off by default in production (`ADMIN_PORTAL_ENABLED` unset → every `/admin` page and
`/api/v1/admin/*` route is a 404, D62). To moderate, run the server locally pointed at the
production database through a secure tunnel, or set `ADMIN_PORTAL_ENABLED=true` only behind an
IP allow-list. Make an admin with `npm run admin:promote -w @jax/server -- <username>`.

## 6. Deploying a new version (checklist)

1. `npm run verify` (types, lint, tests, build) passes on the commit.
2. Back up the database (manual dump) if the release has migrations.
3. `npx prisma migrate deploy`, then `npx prisma db seed` (adds new settings).
4. Restart the server; check `/api/v1/health`.
5. Run `npm run e2e:live` against a staging copy if you have one (never against production:
   it creates and deletes test accounts).
