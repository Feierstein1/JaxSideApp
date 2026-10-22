# Production Database

How to set up and run the production PostgreSQL database (P13.9, from the database review in
`docs/DB_HANDOFF.md`). Nothing here is provisioned yet: hosting needs your approval first (Q15,
`docs/LAUNCH_SERVICES.md`). This is the checklist for when it is.

## Version and extensions

- **PostgreSQL 17 with PostGIS** (the same as development, `postgis/postgis:17-3.5`). PostgreSQL 18
  also works; it has a built-in `uuidv7()` that can replace our `uuid_v7()` function later.
- **Extensions: only `postgis` and `pg_trgm`.** The migrations create both. The development Docker
  image also installs `postgis_tiger_geocoder`, `postgis_topology` and `fuzzystrmatch`; the app
  doesn't use them, so don't enable them in production.
- **`pg_stat_statements`:** turn it on (on RDS: add it to `shared_preload_libraries` in the
  parameter group, reboot, then `CREATE EXTENSION pg_stat_statements;`). It shows which queries take
  the most time, which is what the load test (P13.10) and later tuning start from.

## Connections

- Each server process opens up to **`DATABASE_POOL_MAX`** connections (default 10, in `.env`).
  Small databases allow about 80–100 connections in total, so: processes × pool size, plus the
  jobs, plus your own admin connections, must stay well under that.
- **A connection pooler** (PgBouncer in transaction mode, or the host's own) lets many server
  processes share a few database connections. Not needed for one small server; add it when you run
  more than one server process.
- **If you add a transaction-mode pooler, the scheduled jobs must connect directly**, not through
  the pooler: they hold a session-level advisory lock for their whole run (P13.3), which a
  transaction-mode pooler doesn't support. Give the jobs a `DATABASE_URL` that points at the
  database itself. Check the app's queries through the pooler once in staging before relying on it.

## The database role

- Create one role that **owns the schema** (runs migrations and the jobs) and use it for the app on a
  small setup. The daily job creates and drops the daily `LocationCheck` pieces in the
  `jax_partitions` schema (P13.6), which needs ownership of `LocationCheck`.
- Set timeouts on the role the **app** uses, so one bad query or a stuck transaction can't hold
  things up:

  ```sql
  ALTER ROLE jax_app SET statement_timeout = '10s';
  ALTER ROLE jax_app SET idle_in_transaction_session_timeout = '30s';
  ```

  Migrations can take longer than 10 seconds on a large database. Run `prisma migrate deploy` with
  `SET statement_timeout = 0` (e.g. a separate role without the limit, or
  `PGOPTIONS='-c statement_timeout=0'`).

## Vacuum

- Autovacuum is on by default; leave it on. The busiest tables (`Vote`, `Message`,
  `Notification`, `RateLimitCounter`) are set to vacuum after 2% of rows change instead of 20%
  (migration `autovacuum_tuning`, so production gets it automatically).
- `LocationCheck` doesn't need it: whole days are dropped (P13.6).

## Backups

- Turn on automatic backups with point-in-time restore (7 days at least) and do one restore drill
  before launch (P7.4, `docs/OPERATIONS.md`).
- Backups must include the `jax_partitions` schema (a normal full backup or `pg_dump` does).

## Scheduled jobs

Run from cron (`docs/OPERATIONS.md` §4): `jobs:maintenance` daily, `jobs:counters` every 10
minutes. Maintenance also creates the next 8 days of location-history pieces; if it stops, new
readings go to a catch-all piece and nothing fails, but older data stops being deleted, so watch
that it runs.

## Changing indexes after launch

Before launch (no data), a plain `CREATE INDEX` in a migration is fine. **After launch**, create
indexes with `CREATE INDEX CONCURRENTLY` in a migration of their own (it can't run inside a
transaction), so the table isn't locked while the index builds.
