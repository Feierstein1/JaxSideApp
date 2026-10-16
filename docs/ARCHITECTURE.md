# Architecture

Jax is a location-verified, pseudonymous local social network for Duval County. One backend
serves the phone app and the admin portal. This page is the map; details live in the linked
documents and in the Decision Log (`PROJECT_PLAN.md`, Dxx).

```
 Phone app (Expo / React Native)                 Admin portal (browser, your computer)
   │  HTTPS JSON, Bearer session token              │  HTTPS, httpOnly cookie + CSRF token
   │  + X-Installation-Token                        │  (off on public servers, D62)
   ▼                                                ▼
 ┌─────────────────────────── Next.js server (apps/server) ───────────────────────────┐
 │ /api/v1/*  route handlers → guard → strict zod schema → rate limit → location →     │
 │            ownership/business rules → service → public serializer                  │
 │ /admin/*   server-rendered portal pages (each checks the admin session itself)      │
 │ /legal/*   policy pages                                                             │
 └──────────────┬───────────────────────────────┬──────────────────────┬──────────────┘
                │ Prisma (+ raw SQL for PostGIS) │ S3 API               │ SMTP
                ▼                                ▼                      ▼
        PostgreSQL 17 + PostGIS          Private object storage    Email (Mailpit in dev,
        (all app data, rate limits,      (cleaned photos only)     SES planned)
         sessions, audit log)
```

## Repository

| Path              | What                                                                                                      |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| `apps/server`     | Next.js 16 (App Router): API, admin portal, policy pages, jobs, scripts, tests                            |
| `apps/mobile`     | Expo SDK 57 app (expo-router): Home feed, Places, Account                                                 |
| `packages/shared` | Zod schemas, config defaults, theme colors, policy text, shared types (one source of truth for both apps) |
| `docs/`           | Spec, setup, testing, operations, API reference, security, launch plans                                   |

## Request pipeline (every write endpoint, CLAUDE.md)

1. **Who:** `requireUser` / `requireActor` (app sessions, D3), `requireAdmin` (portal cookie +
   CSRF, D60). Account standing (banned, suspended, deleted) is checked on every request.
2. **What:** a strict zod schema from `@jax/shared`; unknown fields are refused (P3.7).
3. **How often:** Postgres-backed rate limits (D8, D55, D66); limits live in `AppConfiguration`.
4. **Where:** `assertLocationEligible` (P2.4): fresh, accurate, un-mocked reading inside Duval
   (PostGIS `ST_Covers`), within the radius for the action (`ST_DWithin`), no impossible travel
   (D38). Every check is audited; an unaudited allow fails closed.
5. **Whose:** ownership and business rules in the service (404 for other people's things).
6. **Out:** allow-list serializers only; a test scans responses for forbidden keys (P1.19).

A table test lists every write route and fails if a new one is missing its checks
(`write-routes.test.ts`); admin routes have their own walker (`admin-auth.test.ts`).

## Main modules (`apps/server/src/server`)

| Module                | Responsibility                                                            |
| --------------------- | ------------------------------------------------------------------------- |
| `auth/`               | Register, login, sessions, email codes, guests, account changes, deletion |
| `crypto/`             | Per-user envelope encryption of emails, keyed email index (D35)           |
| `location/`           | Readings, service-area boundary, eligibility, impossible travel           |
| `discussions/`        | Feed, posts, rooms, threaded comments, votes                              |
| `directory/`          | OSM import, place search, favorites, community suggestions                |
| `moderation/`         | Screening, spam, strikes/suspensions/bans, appeals                        |
| `admin/`              | Portal sign-in (TOTP), queue, user tools, audit log                       |
| `media/`              | Photo processing (sharp), private storage, signed links, classifier hook  |
| `achievements.ts`     | Medals (idempotent SQL awarding)                                          |
| `jobs/maintenance.ts` | Daily retention, guest expiry, crypto-shredding, medals, cleanup          |
| `serializers.ts`      | The only way user data leaves the server                                  |

## Data (Prisma schema, `apps/server/prisma/schema.prisma`)

Users (email encrypted, no birth year), sessions, installations, guests, profiles, posts
(general with a ~100 m point; business tied to a place), comments (threaded), votes, places,
suggestions, reports, moderation actions, appeals, screening rules, photos, achievements,
location checks/flags, rate-limit counters, settings, audit log. CHECK constraints are written
by hand in migrations. Geography columns are written with parameterized raw SQL.

## Key design choices

- **Server is authoritative** for location, role, status, totals and ownership (§3).
- **Privacy:** emails encrypted per user (D35), birth year never stored (D36), exact readings
  kept 30 days, posts store a rounded point (D7), photos stripped of all metadata (D65).
- **Moderation:** humans decide; automation only warns, holds or blocks text (D56, D57).
- **No Redis yet:** Postgres handles rate limits and sessions (D8); add caching when needed.
- **Admin portal local-only for now** (D62).

See also: `docs/API.md` (generated endpoint list), `docs/SECURITY_PRIVACY_CHECKLIST.md`,
`docs/KEY_MANAGEMENT.md`, `docs/OPERATIONS.md`, `docs/LAUNCH_SERVICES.md`, `docs/TESTING.md`.
