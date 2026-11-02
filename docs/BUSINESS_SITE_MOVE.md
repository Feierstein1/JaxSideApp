# Moving the owner website out of this repo

The owner website (`apps/business`, "JaxSide for Business") was built inside the JaxSide
repo only so it could reuse the app's styles and code (D169). It has its own API and shares
only the **database** with the app. This guide moves it into its own folder so it can be
tested and deployed on its own (D181: staging waits for this).

## 1. Copy into the new folder

```
jaxside-business/
  package.json            from apps/business/package.json (edits in step 2)
  next.config.ts          from apps/business
  tsconfig.json           from apps/business (edit "extends", step 2)
  tsconfig.base.json      from the repo root
  vitest.config.ts        from apps/business
  eslint.config.mjs       from the repo root (keep the general rules and the apps/business block)
  .prettierrc.json        from the repo root
  .prettierignore         from the repo root
  .env.example            the business lines from the repo's .env.example (step 4)
  src/                    from apps/business/src (NOT src/generated: it is rebuilt)
  public/brand/           from apps/business/public/brand (logo and favicon, already copied
                          from apps/mobile/assets)
  scripts/                from apps/business/scripts
  test/                   from apps/business/test
  shared/                 a copy of packages/shared (see "Shared code")
  prisma/schema.prisma    a copy of apps/server/prisma/schema.prisma (see "Database")
  prisma/migrations/      a copy of apps/server/prisma/migrations (for test databases only)
```

### Shared code (`packages/shared`)

The site imports `@jax/shared` for:

- **colors:** `COLORS` (the website) and `DARK` (the phone-style ad preview), `BRAND` (D33);
- **form rules:** sign-in, team, posts and replies, invites, ads (`schemas/business.ts`,
  `schemas/ads.ts`, plus `emailSchema`, `passwordSchema`, `postBodySchema`,
  `commentBodySchema`, `STAFF_NAME_MAX`, `emptyBodySchema`);
- **ad rules:** templates, schedule in Jacksonville time, targeting, plan slots (`ads.ts`);
- **word screening:** the matcher and messages (`screening.ts`);
- **admin settings defaults:** `CONFIG_DEFAULTS` and `CATEGORY_GROUPS`.

Copy the whole `packages/shared` folder to `shared/` and keep the package name
`@jax/shared` (`"@jax/shared": "file:./shared"` in package.json), so no import changes.
**The app keeps its own copy.** When either side changes a shared rule (for example ad
template sizes or the screening matcher), copy the change to the other.

### Database

Both sites use the **same Postgres database**. The app repo **owns the schema and the
migrations** (one migration history, D169); the website never runs `migrate dev` or
`migrate reset`.

- `prisma/schema.prisma`: a copy of the app's. In it, delete the `generator client`
  block (the app's) and change the `generator business` block's `output` to
  `"../src/generated/prisma"`. Copy it again whenever the app's schema changes.
- `prisma/migrations/`: a copy, used only to set up empty **test** databases
  (`test/global-setup.ts` runs `prisma migrate deploy` against `jax_business_test`).
- Add a `prisma.config.ts` like the app's (schema `prisma/schema.prisma`, migrations
  `prisma/migrations`, datasource `DATABASE_URL`).

## 2. Edits after copying

| File                   | Change                                                                                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `package.json`         | name `jaxside-business`; `"@jax/shared": "file:./shared"`; add `prisma` (dev) and the `@prisma/client` version the app uses; scripts: `"db:generate": "prisma generate"`, and `--env-file=.env` instead of `../../.env` in `account:create` and `notices:send` |
| `tsconfig.json`        | `"extends": "./tsconfig.base.json"`; add `"shared"` to `include` if type errors appear                                                                                                                                                                         |
| `next.config.ts`       | `loadEnvConfig(path.resolve(import.meta.dirname))` (the folder itself, not `../..`); `transpilePackages: ['@jax/shared']` stays                                                                                                                                |
| `test/test-db-url.ts`  | `.env` from `../.env` instead of `../../../.env`                                                                                                                                                                                                               |
| `test/global-setup.ts` | run `npx prisma migrate deploy` in the site's own folder (`path.resolve(import.meta.dirname, '..')`)                                                                                                                                                           |
| `eslint.config.mjs`    | the `apps/business/**` paths become `src/**`, `test/**`                                                                                                                                                                                                        |

Then: `npm install`, `npm run db:generate`, `npm run typecheck`, `npm test`, `npm run dev`
(port 3100).

## 3. What the app still does for the website

These stay in the app repo; the website relies on them:

- **Invites (D172):** when an owner is verified (or the admin presses "Send business-site
  invite"), the app server writes the `BusinessInvite` row and emails the link to
  `BUSINESS_BASE_URL/invite?token=…`. Removing an Owner tag ends the place's access.
- **Admin portal → Businesses (D178, D179):** accounts, suspend / revoke / reset / move,
  plans and free plans. Ad approval (B3.3) is added there too.
- **Showing ads in the app (B3.4, B3.6)** and **counting views and Interested** into
  `AdDailyStats` (the website's results page reads them).
- **Showing business posts and replies** as "The Owner" in the app (D174).

## 4. Settings (`.env`)

| Name                                                                            | What                                                                                                                                     |
| ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                                  | the shared JaxSide database (ideally a separate, limited Postgres login: business tables plus the discussion tables it reads and writes) |
| `DATABASE_POOL_MAX`                                                             | connections this site keeps (default 5)                                                                                                  |
| `BUSINESS_SECRET`                                                               | 32+ random characters, different from the app's secrets                                                                                  |
| `BUSINESS_BASE_URL`                                                             | this site's address (for email links), e.g. `https://business.jaxside.com`                                                               |
| `TRUST_PROXY`                                                                   | `true` only behind your own proxy (Caddy)                                                                                                |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, `SMTP_USER`, `SMTP_PASS`                 | email (SES later; Mailpit in development)                                                                                                |
| `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET_MEDIA` | ad pictures, in the app's media bucket under `ads/`                                                                                      |
| `BUSINESS_TEST_DATABASE_URL`                                                    | tests only: a database whose name ends in `_test`                                                                                        |

The app needs `BUSINESS_BASE_URL` too (for invite links).

## 5. Deploying (B5, only with the owner's approval)

- Its own process and host name (for example `business.jaxside.com` in Caddy); the admin
  portal stays off the internet (D62, D153).
- Run `npm run notices:send` every hour (the daily summary emails; each login gets at most
  one a day).
- Update the Terms, Privacy Policy and advertiser terms before the first public sign-in.
