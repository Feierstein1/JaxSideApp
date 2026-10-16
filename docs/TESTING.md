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

## Live end-to-end check (dev server)

`npm run e2e:live -w @jax/server` plays temporary people (usernames starting `zzt`) through the
whole app over real HTTP against the running dev server: sign-up with the emailed code
(read from Mailpit), password reset, location rules, posts, comments, votes, rooms, guests,
profiles, blocking, screening, spam, reports, account changes, the admin portal (password +
authenticator code), strikes, suspension, appeals, bans and account deletion. It then deletes
everything it created (accounts, content, installations, rate-limit counters, test emails)
and restores place post counts. Exit code 1 if any check fails.

It needs the dev server, Docker services and a seeded dev database. The on-phone checklist is
`docs/MANUAL_TESTS.md`.

## Full verification before committing

```sh
npm run verify   # typecheck + lint + all tests + production build of the server
```

The tests call route handlers directly in Node; they don't go through the Next.js bundler. The
production build catches problems that only appear once bundled, for example `import.meta.dirname`
being undefined in a route (found 2026-10-15). It also catches anything other than HTTP handlers
being exported from a route file.
