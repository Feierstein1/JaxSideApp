# Business portal and ads: build brief

Hand-off for the agent who builds this. The owner (Kenny) decided everything below between
2026-10-30 and 2026-10-31; the reasons are in `docs/BUSINESS_PORTAL_DESIGN.md` and the Decision
Log (D165–D168). **Nothing in this brief is built yet.** If something here is unclear or
conflicts with the code, add it to the tracker's Open Questions and ask; don't guess.

## 0. Read first

1. `CLAUDE.md` (working rules; they apply fully to this build).
2. `PROJECT_PLAN.md`: "Current status", the Decision Log (D92, D103, D116, D117, D141, D152,
   D157, D165–D168) and Open Questions Q28, Q29.
3. `docs/BUSINESS_PORTAL_DESIGN.md` (the why behind each decision).
4. `docs/SPEC.md` is requirements only. Never edit it to record decisions.

## 1. What we are building

A **website for verified business owners**, separate from the phone app, with:

- a **separate business account** (own email and password, no link to the owner's personal
  account);
- one account can run **several places**; one place opens straight in, several show a list;
- **three roles**: Owner (master), Manager, Staff; employees get logins the owner creates
  (username + temporary password, must change at first sign-in; revocable at any time);
- the place's **discussion**: read and reply from anywhere, posts still show "The Owner"
  publicly, the owner sees which employee wrote each one;
- **insights**: counts only (see 5);
- **ads on a subscription**: build, preview, schedule, target, approve, serve, count.

Users stay pseudonymous. Owners never learn who is in any number.

## 2. Where it lives (decided; confirm with a small spike first)

Keep it in this repo so it can use the app's styles, images and types:

```
apps/business/     NEW. Next.js web UI only (pages, forms, previews). No database access.
apps/server/       Existing. NEW business API routes (/api/v1/business/*) and Prisma models
                   live here, next to the rules and tests they must obey.
packages/shared/   Existing. NEW zod schemas and types for the business API go here.
```

Why the API stays in `apps/server`: CLAUDE.md requires every write endpoint to go auth guard →
strict zod schema → rate limit → location check (if any) → ownership check, with public
serializers only. Keeping all data access in one place keeps those rules and their tests (for
example `test/write-routes.test.ts`) in one place. `apps/business` can later move out as its
own deployable folder without touching the API.

**Separation rule (D169):** `apps/business` is never part of the phone app's build, bundle,
updates or store releases, and the phone app never imports it (or the server). Only
`@jax/shared` is common to both. ESLint enforces this in `eslint.config.mjs`; keep that rule
passing. The owner website is built and deployed on its own (see B5), never through
`eas build` or `eas update`.

**Spike first (small):** one login round-trip from `apps/business` to the server API, with the
session in an HttpOnly, SameSite=Strict cookie plus a CSRF token (copy the admin portal's
pattern, `apps/server/src/server/admin/auth.ts`). If this proves awkward, the fallback is a
`/business` route group inside `apps/server` like `/admin`. Record the outcome in the Decision
Log either way.

**Reuse, don't copy:**

- Colors: `COLORS` (web) and `BRAND` from `packages/shared/src/theme.ts`. Never hard-code hex
  values or use gold text on white (D33).
- Images and logo: `apps/mobile/assets` (`icon.png`, `brand-emblem.png`, `brand-mark.png`,
  `brand/`). Mobile text comes from `@/text` in the app; the web UI needs its own equivalent.
- Admin portal patterns: `apps/server/src/app/admin/` (layout, forms, tables),
  `apps/server/src/server/admin/` (sessions, TOTP, audit).
- Passwords: the existing argon2 helpers in `apps/server/src/server/auth/`.
- Owner logic to build on: `apps/server/src/server/directory/owners.ts` (claims, team, "The
  Owner" masking), `discussions/posts.ts` and `comments.ts`.
- Area counts: `apps/server/src/server/stats/` and the `AreaStats*` and `PlaceStatsDaily`
  tables.
- Admin settings pattern: `CONFIG_DEFAULTS` in `packages/shared/src/constants.ts` plus
  `apps/server/prisma/seed-data.ts`.
- Media pipeline for ad images and GIFs: `apps/server/src/server/media/`.

## 3. Decisions to follow

- **Claiming** starts in the phone app ("I own this place", from a personal account). Then the
  owner gets an **email link** to create the business account. Existing VERIFIED claims (D103)
  must be linked to business accounts when their owners create one.
- **Verification:** email code to an address at the business's own website domain, or a phone
  check where the admin calls a number **they looked up independently**, never one the
  claimant gives, and the person answering must give the code sent to the claimant. A place with
  neither a website nor a phone number cannot be claimed in the app.
- **Employees:** owner-created logins with a temporary password, forced change at first
  sign-in, revocable and resettable by the Owner or by a JaxSide admin.
- **Roles:** Owner (billing, ads, team, everything), Manager (posts, replies, drafts ads),
  Staff (posts, replies).
- **Posts** made through the portal show as "The Owner" (optional staff name, D157). The real
  employee is recorded and shown to the owner only.
- **Owners read and reply from anywhere**, a deliberate exception to the "must be near" rule.
  Needs its own 🔒 test: only members of that place, only that place.
- **Notifications** to owners: an inbox in the portal plus optional email. No phone push.
- **Moderation** still applies to everything owners post; strikes and bans apply to the
  business account.
- **Subscription model.** A plan sets how many ads can be live at once (at most 3) and which
  features apply. Prices are not decided (Q28); build with plans as data an admin can edit.
  Friends' businesses get free promo periods an admin grants (a "comped" subscription), so
  payments are not needed to start.
- **Payments last** (Stripe or similar, on the website, never in the phone app). Needs the
  LLC, an EIN, a business bank account and the owner's explicit approval of any cost.

## 4. Ads

- **Library:** up to **20 saved ads** per business (drafts and past ads count). Only **live**
  ads count against the plan (at most 3 live at once; a plan may allow fewer).
- **States:** Draft, Waiting for approval, Scheduled, Live, Paused, Ended. Editing a live ad
  sends it back for approval. A JaxSide admin approves every ad before it can go live
  (queue in the admin portal, with the usual screening).
- **Preview:** the owner sees the ad exactly as users will, before submitting.
- **Formats:** image, GIF or post, from **fixed templates only** (no custom layouts or code):
  a **banner** between two posts, a **post-style** ad, a large **feature** ad. The editor
  shows each template's size limits and a live preview, and explains problems in plain words.
  Exact sizes are chosen when the templates are designed (ask the owner; propose, don't
  decide). Media goes through the same upload checks as posts.
- **Schedule:** a start and end date and time, plus days of the week and time of day (for
  example a bar's happy hour, Tue–Fri 4–7pm). Times are Jacksonville local time.
- **Targeting:** a radius around the place and/or chosen ZIP codes. Matched against **the
  reader's location reading that every feed request already carries**, not the page being
  viewed. Never personalized; no personal data is used.
- **Where ads show:** every feed (area feed, place discussions, topic discussions), mixed in by
  the server so the phone can't pick or skip them. At most one ad per business in any one
  list. Roughly one ad per N posts (N is an admin setting); **guests see ads somewhat more
  often** (separate admin setting). An admin can mark a topic ad-free.
- **A place's own page:** a business with an active plan sees only its own ads there (shown
  to any reader); a place with no plan may show other ads.
- **Labels and safety:** every ad is labeled **Sponsored** and has a report button.
- **Content rules (Q30):** local businesses promoting their own shop, bar or restaurant
  (deals, specials, events); relevant to that business; no nudity; no brand or product
  advertising for alcohol, vape or tobacco. Alcohol deals carry a "21+" line. Tobacco and
  vape shop deals are rare edge cases decided at approval (Apple guideline 1.4.3).
- **Stats the owner sees:** views and Interested / Not interested, as **totals** per ad per
  day. Never who. Store daily counters, not one row per view. Show no breakdown smaller than 10.
- **Interested / Not interested** buttons on an ad are a phone-app change (ships with a store
  build, not over the air).

## 5. Insights

Built on data that already exists (D116): people per ZIP per day, week and month; part of the
day; first-time-this-month; "also visited" ZIP pairs; and per-place posts, comments, people,
favorites and votes. Groups under 10 are never shown. Guests and people who switched off area
statistics are not counted; places of worship are excluded. The portal must say plainly that
counts cover JaxSide users only, ZIP areas are larger than a storefront, and numbers are small
at first. Whether paid plans may include these counts is Q29 (owner's decision pending).

## 6. Build order and acceptance

Work one item at a time; tick it only when it works **and** its tests pass. 🔒 items need a
negative (bypass) test. Add every new write route to `test/write-routes.test.ts`.

**B1 Foundation**

- [ ] B1.1 Prisma models and migration (sketch in 7).
- [ ] B1.2 Business sign-in: sessions, CSRF, lockout and rate limits, password rules, optional
      two-factor, forced password change. 🔒 A personal-user token never works here and a
      business token never works on user routes.
- [ ] B1.3 Claim → email invite → create business account; link existing VERIFIED claims.
- [ ] B1.4 Place list (one place goes straight in; several show a list with a back button).
- [ ] B1.5 Employees: create, reset, revoke; three roles enforced. 🔒 Staff can't manage team,
      ads or billing; nobody reaches another business's places.
- [ ] B1.6 Discussion inbox: read and reply from anywhere as "The Owner"; the real author is
      recorded. 🔒 Usernames never appear in anything public (D157).
- [ ] B1.7 Admin portal pages: business accounts (suspend, revoke, move primary).
- [ ] B1.8 Owner notifications (inbox, optional email).

**B2 Insights**

- [ ] B2.1 Counts screens with the under-10 rule. 🔒 No identifying data in any response.

**B3 Ads (no payments)**

- [ ] B3.1 Plans and subscriptions as data; admin can comp a business.
- [ ] B3.2 Ad library, templates, preview, schedule, targeting, 20-ad limit, live-ad limit.
- [ ] B3.3 Approval queue in the admin portal.
- [ ] B3.4 Serving in all three feeds, frequency rules, guest rate, place-page rule, ad-free
      topics. 🔒 Targeting uses only the reader's reading; the phone can't force or hide ads.
- [ ] B3.5 Counters and the owner's stats screen. 🔒 Owners see totals only.
- [ ] B3.6 Phone app: ad cards, Sponsored label, report, Interested / Not interested.
- [ ] B3.7 Load check: feeds with ads still meet the earlier targets
      (`docs/LOAD_TEST_RESULTS.md`).

**B4 Payments** (only with the owner's approval)

- [ ] B4.1 Subscription checkout and billing portal; webhooks; plan changes and cancellation.

**B5 Going live** (only with the owner's approval; the admin portal is deliberately off the
internet today, D62/D153, so this is the first public login surface)

- [ ] B5.1 Public host (for example `business.jaxside.com`) in the Caddy config and deploy
      script.
- [ ] B5.2 Updated Terms, Privacy Policy, advertiser terms and store data-safety forms.

## 7. Data sketch (adapt as needed)

`BusinessAccount` (email or username, passwordHash, role-free identity, mustChangePassword,
createdBy, revokedAt) · `BusinessSession` · `BusinessPlaceAccess` (account, place, role) ·
`BusinessInvite` (hashed token, place, expiry) · `Plan` (name, liveAdLimit, price, active) ·
`Subscription` (account, plan, status, startsAt, endsAt, comped) · `Ad` (place, status,
template, media, text, schedule window, days and time of day, radius, ZIPs) · `AdReview` ·
`AdDailyStats` (ad, day, views, interested, notInterested).

## 8. Working rules for this build

- Branch per item or small group; merge to `main` when tests pass. Commit messages end with
  the Co-Authored-By line given in your session. **Never commit `scripts/dev-remote.mjs`** (it
  is the owner's local tool): stage with `git add -A -- . ':!scripts/dev-remote.mjs'`.
- Any deviation from the spec or these decisions: Decision Log entry first. New ambiguity:
  Open Question, not a guess. Update the tracker's checkboxes, "Current status" and Progress
  Log after each item.
- Prisma 7: create migrations with
  `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script`,
  apply with `migrate deploy`, then `generate`, then check drift is empty. **Never run
  `migrate reset`.**
- No public deployment and no paid services without explicit approval. No secrets in git.
- Don't run heavy local jobs without asking (over-the-air update compiles overloaded the
  owner's PC). Store builds run in Expo's cloud and are fine.
- Colors from `COLORS` / `DARK`, never hard-coded hex. Don't change pop-up or dialog styling.
- Run the full test suite before merging (`npm test`, plus `npm run verify` before a deploy).

## 9. Waiting on the owner

- Q28: prices for the plans. Q29: may paid plans include area counts without a lawyer's review?
- The LLC's legal name and registered address (Terms, advertiser terms, billing).
- Template sizes (you propose, the owner approves).
- A business email address at `jaxside.com` for invites and notices.
