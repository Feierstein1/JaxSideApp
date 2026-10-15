# Testing

```sh
npm run services:up      # tests need PostGIS running
npm test                 # all workspaces
npm run typecheck
npm run lint
```

Per workspace: `npm test -w @jax/shared`, `npm test -w @jax/server`, `npm test -w @jax/mobile`.

## Test database

Server integration tests use a real PostGIS database, `jax_test` (`TEST_DATABASE_URL`), never
the dev database:

- `apps/server/test/test-db-url.ts` refuses any database whose name doesn't end in `_test`, or one
  that equals `DATABASE_URL`. This is covered by its own test.
- Before each run, `prisma migrate deploy` applies pending migrations. This step is non-destructive.
- Each test file clears tables with `resetDb()` (TRUNCATE). Files run one at a time.

To rebuild the test database from scratch (for example, after editing an applied migration),
run this yourself. It is destructive, and Prisma requires a human to confirm it:

```sh
npm run db:test:reset -w @jax/server
```

## Conventions

- Items marked 🔒 in PROJECT_PLAN.md need a **negative** test that proves the bypass fails.
- Test names reference spec sections or decision IDs where useful (e.g. `§16`, `D6`).
- The mobile app has unit tests only for pure TypeScript modules (`src/**/*.test.ts`) so far.
  Device end-to-end tests come in Phase 7 (P7.5).
