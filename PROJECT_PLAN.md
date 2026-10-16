# Jax App — Project Plan & Tracker

Requirements: [docs/SPEC.md](docs/SPEC.md) (cited below as §N).
This file tracks progress, decisions and open questions. Update it whenever work is finished.

## How to use this file

| Mark | Meaning |
|---|---|
| `- [ ]` | Not started |
| `- [~]` | In progress or partly done (add a note saying what is left) |
| `- [x]` | Done: the behavior works **and** its tests or security checks pass (§1 rule 10) |
| `- [-]` | Deliberately deferred or dropped. Must link to a Decision Log entry |

- Item IDs (e.g. `P3.4`) are stable. Refer to them in commits and notes.
- 🔒 = security-critical. Needs a negative test (a test that proves the bypass fails), not just a happy-path test.
- ✅ = maps to a §20 acceptance criterion (see the [Acceptance Criteria Tracker](#acceptance-criteria-tracker)).
- A phase is finished only when every item in it is `[x]` or `[-]` and its **Phase gate** is checked.

---

## Current status

**Phase:** 6 — Photos & Achievements (Phase 5 gate met 2026-10-16; Phase 3 gate pending only the on-device vote/comment check)
**Next action:** Phase 6 — photos (P6.1–P6.6). On-phone checklist: `docs/MANUAL_TESTS.md`.
**Last updated:** 2026-10-16

---

## Open Questions (need your decision)

Questions marked **BLOCKING** must be answered before the phase listed. Each has my recommendation. Answers get moved to the Decision Log.

- [x] **Q1 — Which boundary counts as "Jacksonville"? (BLOCKING Phase 2)** → Answered: include the Beaches (D15)
  §6.1 says the *City of Jacksonville consolidated municipal boundary*. That boundary **excludes Jacksonville Beach, Atlantic Beach, Neptune Beach, and Baldwin**. They are separate municipalities inside Duval County. Under the spec as written, users at Jax Beach could not post.
  *Recommendation:* Use all of **Duval County** (the consolidated city plus the 4 small municipalities), and make the boundary swappable in config.
- [x] **Q2 — What do users outside Jacksonville, or without location, see? (BLOCKING Phase 3)** → Answered: profile and account only; no location-based content (D16). My recommendation below was **not** adopted
  §6.1 and §7.3 allow "permitted read-only browsing," but the general feed is built from the user's location. Someone in Atlanta, or with location turned off, has no point to center the feed on.
  *Recommendation:* Without an eligible location, show a read-only feed centered on a point the user picks (a neighborhood list or a map pin). Business rooms can be read by anyone. Writing always requires a fresh, verified location.
- [x] **Q3 — Do guest comments disappear after one year? (BLOCKING Phase 4)** → Answered: shown for 1 year, then hard-deleted (D17)
  §5.1 says guest comments "remain visible for one year from creation." That could mean (a) they are hidden or deleted after one year, or (b) they are guaranteed to stay for at least one year.
  *Recommendation:* (a). Hide guest comments after 1 year and purge them later according to the retention policy. Registered users' comments stay until deleted.
- [x] **Q4 — Who can comment on a general post? (BLOCKING Phase 3)** → Answered: within 1 mi of the post (D20)
  §7.1 says the author must be within the radius of "the relevant discussion area." For a comment, is that area the **post's** location or the commenter's current feed?
  *Recommendation:* Measure from the post's stored location. You can comment if you are within the general maximum radius (1 mi) of where the post was made.
- [x] **Q5 — Local development environment (BLOCKING Phase 1)** → Docker Desktop; `docker compose up` verified 2026-10-14 (P1.2)
  This machine runs Windows 10 Home. PostGIS and S3-compatible storage are easiest to run locally with Docker Desktop (PostGIS plus MinIO containers).
  *Recommendation:* Use Docker Desktop with WSL2. Confirm it is installed and running. Alternative: a free hosted Postgres with PostGIS (Supabase or Neon) as the dev database.
  *Checked 2026-10-14:* Docker 29.1.3 is installed, but the engine was not running. Node v22 ✓, npm 10.9 ✓, pnpm not installed, Git 2.26 (2020; recommend updating).
- [ ] **Q6 — Email delivery (BLOCKING Phase 1 password reset)**
  Password reset (§4.1) and email changes (§14) require sending email.
  *Recommendation:* In development, log emails to the console or use Mailpit in Docker. Pick a provider later (Resend, Postmark, or SES). Should registration require email verification? I recommend yes; it is cheap protection against abuse.
  *Update 2026-10-14:* Development is unblocked. Mailpit runs in docker-compose and email verification is accepted (D11). Only the **production provider** is still open, and it isn't needed until launch.
- [x] **Q7 — Package manager / repo layout (BLOCKING Phase 1)** → Answered: npm workspaces (D21), layout per D1
  *Recommendation:* A pnpm workspace monorepo:
  `apps/mobile` (Expo), `apps/server` (one Next.js app that serves **both** the REST API and the admin portal), `packages/shared` (zod schemas, types, constants).
  This means one backend, as §3 requires. Note: Expo plus pnpm needs `node-linker=hoisted`, so npm workspaces is the simpler fallback.
  *Updated recommendation:* pnpm isn't installed, so use **npm workspaces**. It's already installed and works with Expo without extra config.
- [x] **Q8 — Mobile testing devices** → Android phone with Expo Go (2026-10-15). iOS: same codebase; iPhone testing via Expo Go is possible any time, and App Store builds go through EAS Build (no Mac needed) once an Apple Developer account exists (paid, needs your approval)
  Do you have a physical iPhone and/or Android device? Location features need real GPS, or emulator location spoofing for tests. Native modules (maps, image picker, integrity APIs) need an **Expo dev build**; Expo Go will not be enough later on. iOS builds need either a Mac or EAS Build (free tier available).
- [x] **Q9 — Map provider (needed by Phase 2 UI and the admin map preview)** → `react-native-maps` (Google Maps on Android, Apple Maps on iOS; works in Expo Go). The user's main need is a filterable, sortable nearby list; the map is a second view of the same results (D40). A Google Maps API key is needed only for published Android builds (ask before creating; billing account)
  `react-native-maps` uses Apple Maps on iOS and Google Maps on Android. Android needs a Google Maps API key (free tier with a billing account). Alternative: MapLibre with a free tile provider.
  *Recommendation:* react-native-maps for the MVP, and record the Google key as an external dependency.
- [x] **Q10 — Geocoding of submitted addresses (§9.3)** → Answered by design: the pin is the suggester's own location while standing at the place, address optional (D63)
  Turning a typed address into coordinates needs a geocoder. The public Nominatim service has strict usage limits.
  *Recommendation:* For the MVP, require a **map pin** (the address is optional text), so no geocoder is needed. Add one later.
- [x] **Q11 — Legal / policy text** → Answered: beta policy text written (P4.13) and used as-is; legal review is **not a blocker** (D52)
  The spec needs a Terms of Service, Privacy Policy, Community Guidelines, and retention policy. I can draft placeholders, but **an attorney should review them before any public launch.** See risks R3 and R4.
- [x] **Q12 — Can guests vote? Can guests file reports? (BLOCKING Phase 4)** → Answered: no voting; reports allowed, with report rate limits for **all** users (D28). **Changed 2026-10-16: guests can't report either (D54)**
  §5 lists guest capabilities as browse and comment only, so voting isn't included. §5 also says guests "cannot bypass … reporting", which is unclear: it could mean they can be reported, or that they can report.
  *Recommendation:* Guests **cannot vote** (keeps vote totals tied to accountable accounts) but **can report** content (safety reports should be easy for anyone who can see content). The schema already supports this: `Vote.voterId` is a required User, and `Report` allows a guest reporter.
- [ ] **Q14 — Starter slur list for screening (P5.4)** *(no editor yet, D62: a list would go in the seed file)*
  Screening works, but only 7 starter rules (threat phrases) ship. Slurs aren't seeded, so none are caught until someone adds them.
  *Recommendation:* load a well-known open-source English slur list as **BLOCK** rules (kept out of the app's screens and editable in the admin portal), and add local terms over time. Alternatively, add terms by hand in the admin portal once it exists.
- [ ] **Q13 — Maps on Android (P2.16, D42)**
  The map shows a black box with the Google logo on the user's Android phone: Google Maps needs an API key tied to our app, and Expo Go can't use our own key. Both fixes need our own **development build** (EAS Build or Android Studio), which later items need anyway (integrity checks, P2.8).
  *Options:* (a) **Google Maps key**: map loads in the phone SDKs are free, but Google requires a billing account to create the key. (b) **MapLibre** + free/open tiles: no Google account; a different map library. *Recommendation:* (a) for the MVP, since the code already uses `react-native-maps`; revisit if Google costs ever appear. Needs your approval to create the Google Cloud project and billing account.
  *User, 2026-10-15:* deferred; **prefers a free map** when we return to it, so MapLibre + open tiles is the likely choice.

---

## Issues found in the spec

These are gaps, contradictions, or likely mistakes in the original prompt. Each one is resolved by a question above or a default in the Decision Log.

1. **Boundary excludes the Beaches.** See Q1.
2. **Vote uniqueness is worded wrong (§8).** It says to prevent duplicate votes "of the same type." The constraint must be **one vote per (voter, target)** regardless of up or down, otherwise someone could upvote *and* downvote the same item. → D6
3. **"Polymorphic" targets.** Comments, votes, reports, and photos each point at "target content" (a general post, business post, or comment). Prisma has no native polymorphic relations, and a loose `targetType + targetId` column has no foreign key. → D5
4. **Polymorphic authors.** A post or comment author can be a `User` *or* a `GuestSession`. → D5
5. **Reading the feed needs location.** The spec focuses on write checks, but read queries also need a center point. See Q2.
6. **No rate-limit store.** §11.3 and §18 require rate limits, but §3 says no Redis until needed. → D8 (Postgres-backed limiter).
7. **Guest ban evasion.** "Guests cannot evade bans," but a reinstalled app gets a new guest. The only levers are a server-issued installation ID plus platform integrity (App Attest / Play Integrity), and both are imperfect (§6.2 acknowledges this). Expect partial mitigation, not prevention. → R2
8. **Missing items:** email verification, password-reset token rules, session lifetime, and strike thresholds are all unspecified. → defaults D9–D11.
9. **App Store requirements** for user-generated-content apps (Apple guideline 1.2): report, block, a content filter, published contact information, and a EULA stating zero tolerance for objectionable content. The spec covers most of this. The EULA wording and support contact are not covered yet. → P7.10
10. **CSAM legal obligation.** US providers that become aware of CSAM must report it to NCMEC (18 U.S.C. §2258A). The spec prohibits CSAM but has no reporting workflow. → P5.14, R4
11. **Admin "map preview"** needs map tiles on the web as well. → Q9

---

## Decision Log

Format: `D# — date — decision — reason`. Proposed items become **Accepted** when you approve them.

| ID | Status | Decision | Reason |
|---|---|---|---|
| D1 | **Accepted** 2026-10-14 | Monorepo: `apps/mobile`, `apps/server` (Next.js API + admin), `packages/shared` | Single backend (§3); shared zod schemas mean client and server validation can't drift apart |
| D2 | **Accepted** 2026-10-14 | Backend = Next.js App Router route handlers under `/api/v1/*`; admin portal = pages in the same Next.js app under `/admin` | §3 asks for one backend with the rationale documented. Admin stays a separate web experience (§10) |
| D3 | **Accepted** 2026-10-14 | Auth: server-managed opaque session tokens stored in a DB `Session` table (token hashed). Mobile sends `Authorization: Bearer`; admin uses an httpOnly, SameSite=strict cookie plus CSRF token. Passwords hashed with argon2id | Revocable immediately on ban or deletion (§4.4, §11.3). Avoids JWT revocation problems |
| D4 | **Accepted** 2026-10-14 | Admin sign-in requires TOTP 2FA | §10.1 "stronger authentication where available" |
| D5 | **Accepted** 2026-10-14 | Separate `GeneralPost` and `BusinessPost` tables (§2 requires separation). `Comment`, `Vote`, `Photo`, `Report` use **explicit nullable FKs** (`generalPostId`, `businessPostId`, `commentId`) plus a DB CHECK that exactly one is set. Authors: nullable `userId` / `guestSessionId` plus a CHECK that exactly one is set | Real foreign keys and cascades, no orphaned polymorphic IDs |
| D6 | **Accepted** 2026-10-14 | `Vote` unique on (voter, target). Value is +1 or −1. Changing a vote is an upsert; removing it is a delete. Score is kept in a counter column updated in the same transaction | Fixes spec issue #2; server-authoritative totals (§8) |
| D7 | **Accepted** 2026-10-14 | Location check = one server function `assertLocationEligible(actor, reading, context)` called by every write route. Precise coordinates are stored only in a `LocationCheck` audit table with short retention (30 days proposed). Posts store a **coarsened** point (~100 m grid) for feed queries | §6.2, §6.3 |
| D8 | **Accepted** 2026-10-14 | Rate limiting in Postgres (fixed-window counters table), with limits read from `AppConfiguration` | No Redis (§3, §18); swappable later |
| D9 | **Accepted** 2026-10-14 | Strikes: warn → 24 h suspension → 7 d suspension → permanent ban. Strikes decay after 180 days. All values configurable | Spec gives no thresholds |
| D10 | **Accepted** 2026-10-14 | Sessions: mobile 30 days sliding; admin 8 h with 30 min idle timeout. Reset tokens: single use, 30 min expiry, hashed in the DB | Spec gives no values |
| D11 | **Accepted** 2026-10-14 | Registration requires email verification before posting (reading allowed) | Abuse protection; see Q6 |
| D12 | **Accepted** 2026-10-14 | Testing: Vitest (unit and integration against a real PostGIS test DB), Playwright (admin E2E), Maestro or Detox (mobile critical flows, Phase 7) | §3 testing requirement |
| D13 | **Accepted** 2026-10-14 | Images: client asks for an upload grant → uploads to a private **quarantine** bucket → server validates, strips EXIF, and re-encodes with `sharp` into a private bucket → delivered only through short-lived signed URLs | §12 |
| D14 | **Accepted** 2026-10-14 | Data-retention periods (to be published in-app): location telemetry 30 d; expired guest session data 180 d; deleted account PII purged after 30 d; moderation records 2 y | §4.4, §5.1, §6.3 |
| D15 | **Accepted** 2026-10-14 | Service area = **all of Duval County**: consolidated Jacksonville plus Jacksonville Beach, Atlantic Beach, Neptune Beach, Baldwin. Stored as one PostGIS polygon, swappable | User decision; overrides §6.1's "municipal boundary" wording |
| D16 | **Accepted** 2026-10-14 | Without a verified in-boundary location (outside Duval, or location off/denied), users can access **only their own profile, account and settings**. No feed, comment or business-room content is shown. Server enforces this on **read** endpoints too, not just writes | User decision; narrows §6.1 / §7.3 "read-only browsing" for out-of-area users |
| D17 | **Accepted** 2026-10-14 | Guest comments are shown for 1 year from creation, then **hard-deleted** by a scheduled job (not hidden or archived). Exception: content under an open moderation or legal hold (e.g. CSAM evidence, R4) is preserved until the hold clears | User decision: avoid storing high-volume guest data |
| D18 | **Accepted** 2026-10-14 | The 18+ rule is a standard social-media age policy (ToS + birth-year screen), not an adult-content site. Explicit/adult content is prohibited in the content rules | User clarification; see R3 |
| D6 | **Accepted** 2026-10-14 | (Confirmed) One vote per user per item | User confirmed spec issue #2 |
| D19 | **Accepted** 2026-10-14 | **Business rooms are location-only for reading too.** Viewing a business's discussion requires a fresh verified location within the business radius (≤ 0.3 mi). The directory and search still list places and basic info (name, category, distance) so users can find them, but discussion content is locked until they're nearby. Favorites save the place, not remote access | User decision ("strictly location-based, for now"); overrides §7.3 read-only browsing for business rooms. May relax later |
| D20 | **Accepted** 2026-10-14 | Commenting on a general post requires being within the general max radius (1 mi) of the post's stored location | Q4 answered |
| D21 | **Accepted** 2026-10-14 | Package manager = **npm workspaces** | Q7 answered; already installed, no Expo config workarounds |
| D22 | **Accepted** 2026-10-14 | The age screen's "current year" is the calendar year in **America/New_York**, so the cutoff moves at local midnight on Jan 1 | §4.2 doesn't name a timezone; Jacksonville is Eastern. Tested at the UTC/Eastern boundary |
| D23 | **Accepted** 2026-10-14 | Usernames: 3–20 characters, ASCII letters/digits/underscore, unique case-insensitively (`usernameNormalized`). Reserved list blocks impersonating names (admin, moderator, guest, support, jax, …) | §4.3 gives no format rules; the reserved list protects the GUEST label and staff names |
| D24 | **Accepted** 2026-10-14 | Passwords: 10–128 characters, no composition rules (NIST 800-63B style). The maximum length bounds argon2 cost | §4.1 gives no policy |
| D25 | **Accepted** 2026-10-14 | Local S3 = **SeaweedFS** (pinned image) instead of MinIO. The app uses only the generic S3 API, so production can use any S3-compatible service | MinIO no longer publishes community Docker images (pull fails). Dev-only tool change |
| D26 | **Accepted** 2026-10-14 | Versions: Next 16.4, React 19.2.3 (Expo 57's pin, shared across the workspace), Expo SDK 57, Prisma 7.10 with the `pg` driver adapter, **TypeScript 6.0** (not 7), zod 4, Vitest 5 | typescript-eslint doesn't support TS 7 yet; one React version avoids duplicate-React bugs in a hoisted monorepo; Prisma's `latest` tag is an 8.0 RC, so the stable 7.10 is used |
| D27 | **Accepted** 2026-10-14 | Test runs apply migrations with `migrate deploy` and clear data with TRUNCATE on a DB whose name must end in `_test`. A full rebuild (`db:test:reset`) is run by a human | Prisma 7 blocks `migrate reset` from AI agents without explicit user consent. This design is also safer for CI |
| D28 | **Accepted** 2026-10-14 | Guests **cannot vote** (server rejects; `Vote.voterId` is a required User). Guests **can report**. Reports are rate-limited for everyone: registered users per minute + per day, guests at lower limits, plus one open report per (reporter, target) (P5.1) | Q12 answered. Prevents report flooding / brigading against a user
| D29 | **Accepted** 2026-10-15 | Login throttling counts **failed** attempts only: **15 per IP** per 15 min (was 50, counting all attempts) and 10 per account per 15 min. Successful logins never count. Both values are editable in `AppConfiguration` | User request: 50 per IP is too many. Counting only failures keeps people who share one IP (cell-carrier NAT, café wifi) from blocking each other's normal sign-ins |
| D30 | **Accepted** 2026-10-15 | **No user-facing web version of the social app in the MVP.** The web surface is: (1) the admin portal under `/admin` (P5.11+), and (2) a few small account pages served by the same server: confirm email, reset password, and policy pages (ToS, privacy, retention). Later, before launch, add Android App Links / iOS Universal Links on the real domain so email links open the app directly when it is installed, falling back to these pages (P7.10) | §2/§19 scope the product as a mobile app plus an admin portal. Email links must work in any mail client and on any device, so a small web fallback is still needed |
| D31 | **Accepted** 2026-10-15 | Email confirmation and password reset happen **in the app** with a 6-digit code from the email. The same email also carries a link (browser fallback for computers, or when the app is not installed). Code and link share one single-use token. Codes: 15-minute expiry, dead after 5 wrong guesses, 20 wrong guesses per IP per 15 min, stored as an HMAC with the server secret. Unknown email, wrong code and expired code give the same error. Tapping the link will open the app once App Links / Universal Links exist (P7.10, D30) | User wants verification and reset inside the app. Codes work in Expo Go today with no domain; links still cover email read on a computer |
| D32 | **Accepted** 2026-10-15 | Amends D24: a new password can't start or end with whitespace (signup, reset). Sign-in trims edge whitespace from the typed password. Spaces inside a password are still allowed | Phone keyboards can add an invisible trailing space, so the password saved and the one typed later differ. Refusing edge spaces when a password is set makes trimming at sign-in safe |
| D33 | **Accepted** 2026-10-15 | **Color scheme = Jacksonville Jaguars team colors + white:** gold `#D8A328`, teal `#136677`, black `#000000`, old gold `#9E7A2C`, white `#FFFFFF`. Defined once in `@jax/shared` (`BRAND`, semantic `COLORS`); screens never hard-code hex values. Readability rules: teal + white for primary actions; gold always with black text; never gold text on white or white on gold. A test enforces contrast. Palette only: no Jaguars/NFL names, logos or affiliation. Full notes: `docs/UI_DESIGN.md` | User request, with reference image. Contrast rules keep the gold readable (gold on white is only 2.3:1) |
| D34 | **Accepted** 2026-10-15 | Location-check details (within D7): freshness is measured against the **server** clock, with a 30 s allowance for a phone clock running ahead (`LOCATION_CLOCK_SKEW` explains the fix). Android's `mocked` flag means denial. The comment/vote radius is measured from the post's stored (~100 m-rounded) point. Audit failure: a denial still returns its real reason, but an allowed check that can't be audited is refused (fail closed) | Spec gives no values. Server time can't be faked by the client; fail-closed keeps every location-restricted action traceable |
| D35 | **Accepted** 2026-10-15 | **Emails encrypted at rest** with envelope encryption: each user has a random data key, locked by a versioned master key held outside the database; email encrypted AES-256-GCM and bound to the user's ID. Lookup and uniqueness use a keyed hash (separate `EMAIL_INDEX_KEY`). Same for pending email changes. Keys, storage, backup and rotation in `docs/KEY_MANAGEMENT.md`. Production keys go in a managed secrets store (paid, needs approval before launch) | User request: a leaked database or backup should reveal no emails and allow no matching against known email lists |
| D36 | **Accepted** 2026-10-15 | **Birth year is not stored.** It's checked at signup, then discarded; only the cutoff the user passed is kept (`ageCutoffYear`, e.g. "born in 2007 or earlier"). Deviates from §4.2/§16, which assume storage | User decision: after the age attestation the year has no use and is just more personal data to protect |
| D37 | **Accepted** 2026-10-15 | Amends D14. **Deleted accounts:** encrypted email kept 30 days, then crypto-shredded (data key + ciphertext destroyed, so backups become unreadable too). **Banned accounts:** the email lookup hash is kept to block re-registration. **Legal hold** (`legalHoldAt` + note, set by an admin for CSAM, threats or police requests) suspends shredding until released. Revealing an email in the admin portal requires a reason and is audited | User wants the ability to identify a culprit for serious cases and inform authorities, without keeping data longer for ordinary accounts |
| D38 | **Accepted** 2026-10-15 | Impossible-travel thresholds: **refuse** above 1,000 km/h over at least 5 km (15-minute restriction); **flag only** above 160 km/h over at least 2 km. Distance is reduced by both readings' accuracy; only readings from the last 2 hours are compared. All configurable | User asked for a gentle beta version. The ~300 mph threshold first discussed would block real air travelers (Atlanta → Jacksonville is ~500 km/h gate to gate), so refusing is reserved for physically impossible speeds |
| D39 | **Accepted** 2026-10-15 | Directory: search and place info need a fresh in-Duval location (D16) but no radius (D19); registered users only (guests are limited to the general feed, §5). Favorites rank as if 4× closer (`directory.favoriteDistanceFactor`) | §9.2: favorites "appear prominently … without replacing geographic relevance entirely" |
| D40 | **Accepted** 2026-10-15 | Places tab = a **filterable, sortable nearby list** with an optional **map view** of the same results. Filters: 8 category groups shared by app and server (`CATEGORY_GROUPS`). Sorts: nearest (default), A–Z, favorites first, best match when searching. Map: `react-native-maps`, up to 50 pins per request | User: "a list of businesses nearby … sorted by different filters"; a map is a nice extra (Q9) |
| D41 | **Accepted** 2026-10-15 | Discussion details: reading a general post needs only an in-Duval location (D16) while commenting/voting needs 1 mi (D20); replies nest at most 3 deep; deleted comments stay as "[deleted]" placeholders; editing/deleting your own content needs no location; places carry a `postCount` counter updated in the same transaction (shown on place rows); "Top" = score within 7 days; feed pages of 15 | User asked for post counts on places, paginated sleek feeds and visible comments/votes; keeps reads cheap and threads readable |
| D42 | **Accepted** 2026-10-15 | Hide the Map toggle on Android until a development build with a maps key exists (Q13); keep it on iOS (Apple Maps works in Expo Go) | A black box is worse than no map; the list covers the user's main need |
| D44 | **Accepted** 2026-10-15 | Guests: **one guest identity per app installation**. Asking again rotates the token (the old token stops working) instead of creating a new guest, so reinstalling is the only way to get a new one. Limits: 3 guest starts per installation per day, 10 per IP per hour. A banned installation, or one with any banned guest, can't start guest mode (P4.6) | Keeps guest mode low-friction while making "start a fresh guest" useless for evading a ban (§5, MS4) |
| D45 | **Accepted** 2026-10-15 | Guest comment removal after 1 year (D17): a comment **with replies is blanked** (kept as a "[deleted]" placeholder, no guest link) so others' replies survive; one without replies is hard-deleted. Comments with an OPEN report are skipped until resolved. Guests can't edit or delete their own comments (no account to recover; moderators can remove them) | The spec asks for hard deletion but also for threaded replies; blanking removes the guest's content while keeping the thread intact |
| D46 | **Accepted** 2026-10-15 | Username change (P4.9): 30-day cooldown, except capitalization-only changes. A released name stays **reserved for 30 days** (`username.releaseHoldDays`) so no one can take it right away and pose as that person. History kept in `UsernameHistory` | Prevents impersonation via freshly released names (MS4) |
| D47 | **Accepted** 2026-10-15 | Email change (P4.10): needs the current password; a 6-digit code goes to the **new** address and the switch happens only after it's entered; the old address gets a notice at the start and at the end. An address already in use gets the same response (plus an email to that address), so emails can't be probed. Wrong-password checks are limited to 5 per 15 min per account | Same in-app code pattern as D31; no account enumeration (§16) |
| D48 | **Accepted** 2026-10-15 | Account deletion (P4.12): password + typing DELETE. Immediately: status DELETED, all sessions revoked, bio and favorites removed, profile 404, posts show "deleted user". After 30 days (unless `legalHoldAt` is set): email ciphertext, data key and email hash destroyed (crypto-shred, D37), username freed as `deleted_<random>`, location checks and email tokens deleted. Banned accounts can't sign in to delete themselves, so their email hash stays for ban enforcement | Implements D14/D37 and the user's request to keep data only for legal reasons |
| D49 | **Accepted** 2026-10-15 | Public profiles show username, bio, join date, post count and the person's recent **area (general) posts near the viewer**; business posts and comments aren't listed. Viewing needs an in-Duval reading like the feed (D16). Blocking (P5.2) built now with profiles: block/unblock from a profile, list in Settings | Avoids revealing where someone hangs out (business rooms) while still giving context. P5.2 was needed for the Settings screen (P4.11) |
| D50 | **Accepted** 2026-10-15 | P4.7 guest-to-registered upgrade: **deferred**. Guests sign up normally; their guest comments stay as GUEST | Linking a guest to an account adds risk (a shared phone's guest history would join someone's account) for little benefit. Revisit after launch |
| D51 | **Superseded by D54** 2026-10-15 | **What a guest is:** someone who wants to use the app right away with very limited access, **not** an out-of-town user. Guests follow the same in-Duval location rules as everyone (D16). They browse area posts; for now they may also comment, but `guest.commentsEnabled` (server setting, default on) turns guests **read-only** without an app update. Never top-level posts, votes or business rooms | User decision. The user may take commenting away later; the switch is enforced by the server and the app hides the comment box when off |
| D52 | **Accepted** 2026-10-15 | Policy text (Q11): the written Terms, Privacy, Guidelines and Retention pages are used **as-is for the beta**, labeled "Beta". A lawyer's review is optional and the user's call before a wide public launch; it does not block any phase | User: doesn't want a blocker for a beta. Not legally required to have a lawyer write them; it's risk reduction (R3, R4) |
| D53 | **Accepted** 2026-10-15 | Reports (P5.1): a report targets exactly one thing (post, comment or profile; DB check). Content reports reach the author through the content, not a copied user ID. The same person reporting the same item again while it's still open is folded into the first report; after it's resolved, a new report opens a new case. The reporter sees status only (waiting / action taken / no action), never moderator names or notes. Reporting needs an in-Duval reading like viewing (D16). "Child safety" shows a "call 911 if a child is in immediate danger" note | Stops report flooding, keeps one case per item per person, and avoids leaking moderation details |
| D54 | **Accepted** 2026-10-16 | **Guests are view-only.** They browse area posts and comments, and nothing more: no posts, comments, votes or reports (server returns 403 GUEST_NOT_ALLOWED). **Replaces D51's guest commenting and D28's guest reports.** Guest comment/report limits and the `guest.commentsEnabled` switch were removed. The GUEST label and the 1-year cleanup stay, for comments left before this change | User decision: guests only get viewing privileges, so anyone without an account can't put content in front of others |
| D55 | **Accepted** 2026-10-16 | Rate limits (P5.3): 10-second **burst** limits on top of per-minute and daily ones (posts 1, comments 3, votes 15), a daily vote cap (1,000). 429 responses say how long to wait ("Try again in 3 minutes") and carry a `Retry-After` header. All values in AppConfiguration. Upload and place-submission limits are configured and get wired up with those features (P6, P5.8) | §11.3 asks for per-minute **and** burst limits; fixed windows alone allow a double burst at a window edge |
| D56 | **Accepted** 2026-10-16 | Text screening (P5.4): rules live in a `ScreeningRule` table (term, WORD or CONTAINS match, action, category, optional message, on/off), cached 30 s. Text is normalized before matching (accents, look-alike letters, leetspeak with 1 read as i or l, stretched letters, spaced or dotted letters, zero-width characters). **BLOCK** → refused with the reason; **WARN** → "Post anyway?" (resend with `confirmWarning: true`); **HOLD** → saved hidden (not counted) plus an automatic report with no reporter, so it lands in the moderation queue. Edits, bios and usernames can't be held, so HOLD refuses them; usernames are refused on any match. No profanity rules by default. Starter rules: 7 threat/"kill yourself" phrases, all HOLD | §11.2: configurable, normalized, explanatory prompts, high-risk content blocked or held; automated screening never punishes by itself |
| D57 | **Accepted** 2026-10-16 | Spam checks (P5.5) on new posts and comments, after screening: **duplicates** (same person, same normalized text of 20+ characters within 24 h, across posts, rooms and comments) are refused with 409; **links**: more than 2 in one item, or any link from an account under 24 h old, is held for review with an automatic SPAM report; edits with more than 2 links are refused. All thresholds in AppConfiguration. Same text from *different* accounts (coordinated spam) is left to reports and the admin queue for now | §11.3 "duplicate-content and spam detection"; holding (not refusing) link posts avoids punishing honest users |
| D58 | **Accepted** 2026-10-16 | Enforcement details (P5.6): strikes are `ModerationAction` rows (WARN, SUSPEND, BAN) on the permanent user ID; voided strikes and ones older than 180 days don't count. Direct suspensions/bans count as strikes. A suspension never shortens a longer one. A **ban** revokes all sessions and bans every phone (installation) the account signed in on; lifting it un-bans a phone only if no other banned account used it. **Admin accounts can't be sanctioned from the portal.** Users see their own active strikes with the reason (never the admin or internal note) under Account → Account standing; the suspension message shows the end time (Eastern). Maintenance flips ended suspensions back to ACTIVE | D9 ladder; ban carry-over for MS4; protects against a hijacked admin silencing other admins |
| D59 | **Accepted** 2026-10-16 | Appeals (P5.7): one `Appeal` per strike at a time (DB index). Warnings/suspensions: appeal within 30 days, once. Bans: any time; after a rejection, again after 90 days. 3 appeals per day per person. Accepting voids the strike (lifting the suspension/ban it caused); the decision note is shown to the person. **Banned or suspended people appeal from the sign-in screen with their username/email + password** (user chose option A): the password routes share login's failed-attempt limits, work from a banned phone, only show standing and file appeals, and refuse accounts in good standing. The app keeps those credentials in memory only | User decision 2026-10-16; §11.3 "appeals or unban requests under configurable eligibility rules" |
| D60 | **Accepted** 2026-10-16 | Admin portal access (P5.11): admins are existing confirmed accounts promoted by a **server-side command** (`admin:promote`), never from the app or portal. Sign-in = password (same checks and failed-attempt limits as the app), then a 6-digit authenticator code (TOTP, built on node:crypto; first sign-in shows a QR code; secret encrypted with the user's data key; each code works once; 5 wrong codes per 15 min). Session = httpOnly SameSite=Strict cookie + CSRF token (double-submit, hash stored), 8 h max, 30 min idle. App (Bearer) sessions never work on admin routes and admin sessions never work in the app. Losing the role ends access immediately | D3, D4, D10; §10 separate web experience with stronger authentication |
| D61 | **Accepted** 2026-10-16 | Moderation queue (P5.14): open reports are grouped into one **case** per item (post, room post, comment, profile), sorted child safety/threats first, then held content, then by report count. Decisions: **remove** (hidden, counts adjusted), **approve/restore** (held content goes live or removed content comes back, counted again), **dismiss** (content stays), **escalate** (child safety: hidden, kept, author put on legal hold, admin reminded to report to NCMEC). Each closes all the case's open reports, writes a `ModerationAction` and an audit entry, and can add a strike. Admin pages show usernames and account facts but **never emails**. Every admin page checks the session itself, not just the layout. Admin changes limited to 60/min per admin | §10.3; R4 (preserve, don't delete); defense in depth for Next's partial rendering |
| D62 | **Accepted** 2026-10-16 | The admin portal is a **desktop web portal** (browser, not the phone app) and, for now, is used **only on the user's own computer against the dev server**: not hosted. Keep it lean until there are more users: no settings editor or screening-rules editor yet (P5.17), no reveal-email/legal-hold screens yet (P5.18), no per-user rate-limit or location-flag screens (P5.14 extras). Settings and screening rules are changed in the seed file or database meanwhile. **Before the API is deployed publicly (Phase 7), `/admin` and `/api/v1/admin/*` must be turned off or restricted on the public server** | User decision 2026-10-16: avoid small-screen limits; don't over-engineer the portal yet |
| D63 | **Accepted** 2026-10-16 | Place suggestions (P5.8–P5.13): the person suggests a place **while standing at it**, and their current reading is the pin (works on Android without a map, Q13; answers Q10 without a geocoder); address is optional text. Limits: confirmed email, account at least 24 h old, 5 per day, 10 waiting at once, no repeat of your own pending suggestion; name and notes are screened. Possible duplicates (similar name within 300 m, or anything within 20 m, plus other pending suggestions) are shown while typing and to the admin. Suggestions are a separate table, so never in the directory until approved. Approve (optionally correcting name/category/address) creates a `community` place and awards Approved Contributor once (claim-first transaction + unique source ID + badge primary key); reject needs a reason the person sees, and they may suggest again; merge links to an existing place (no badge). Bulk approve/reject with a confirmation listing the items. The portal shows a small OpenStreetMap preview of each pin (free, no key) | §9.3; Phase 5 gate |
| D64 | **Accepted** 2026-10-16 | Achievements (P6.7–P6.9): definitions and thresholds live in the `Achievement` table (seeded; `active` switches one off everywhere). Awarding is server-side SQL with ON CONFLICT DO NOTHING on the (user, achievement) key, only for ACTIVE users. **First Contribution** = a post or comment still visible after 24 h (daily job); **Well Received** = at least 5 *different* posts each at +3 or more (checked on each upvote and daily), so volume or one viral post doesn't count; **Approved Contributor** = on place approval. Medal keys ride along with every post/comment author (small old-gold icons, D33) and full medals appear on profiles | §13: small, configurable, server-side, no rewards for spam or volume |
| D43 | **Accepted** 2026-10-15 | The signed-in username shows in the top bar on every screen, with an eye button that hides it **on that device's screen only** (stored on the device). Posts still show the username to others | User request. Screen-privacy toggle, not anonymous posting. **Confirmed by the user 2026-10-15** |

---

## Phase 0 — Decisions & Environment

- [x] **P0.1** Answer the blocking questions Q1, Q2, Q4, Q7 (Q5 = Docker; pending engine start, P0.6)
- [x] **P0.2** Accept or modify proposed decisions D1–D14 (all accepted 2026-10-14)
- [~] **P0.3** Install and verify tools: Node 22 ✓, npm 10 ✓, Git ✓, Docker Desktop ✓, Expo tooling ✓ (Android bundle exports). *Left:* Android emulator and/or physical device (Q8)
- [x] **P0.4** `git init` (branch `main`), `.gitignore` (including `.env*` except `.env.example`), first commit `0a9a6d5`
- [x] **P0.5** Repo copied to `C:\Users\kenfe\Projects\JaxApp` (2026-10-14). The old OneDrive copy can be deleted once you've confirmed the new one
- [x] **P0.6** Docker engine responding to `docker info` (verified 2026-10-14; the earlier error was temporary). Existing containers `php-afsb` and `mariadb-afsb` run alongside; check for port conflicts in P1.2. (Git update dropped: 2.26 is fine; only `git init -b` is missing, which has a simple workaround)
- [x] **Phase gate:** All blocking questions answered; environment runs `docker compose up` successfully (2026-10-14. Q6's production provider is deferred; dev uses Mailpit)

## Phase 1 — Repository & Foundation (§21 P1, §3, §4.1, §4.2, §16, §17)

**Scaffolding**
- [x] **P1.1** Monorepo workspace, root TS config, ESLint and Prettier, shared scripts (`dev`, `test`, `lint`, `typecheck`)
- [x] **P1.2** `docker-compose.yml`: PostGIS 17/3.5 (port 5433, plus a `jax_test` DB), **SeaweedFS** S3 (D25), Mailpit. Localhost-only ports; healthchecks; credentials from `.env`
- [x] **P1.3** `apps/server` Next.js app; `GET /api/v1/health` (DB check, 503 when down); pino logger with PII redaction (tested); `route()` wrapper returns generic 500s without internals (tested)
- [x] **P1.4** `apps/mobile` Expo 57 + Expo Router + TypeScript; typed API client (tested: bearer token, error mapping, 401 clears token); token in `expo-secure-store`; placeholder home calls `/health`
- [x] **P1.5** `packages/shared`: `z.strictObject` auth schemas (tests reject `role`/`status`/`id` smuggling), config defaults, username rules (D23), age helpers (D22)
- [x] **P1.6** `.env.example` with placeholders only; env validation at server boot 🔒 (negative tests: missing values, short secrets, `.env.example` placeholders rejected, values never echoed in errors)
- [x] **P1.7** Vitest with an isolated `jax_test` database (D27); guard refuses non-`_test` DBs (tested); `npm test` runs all workspaces

**Database**
- [x] **P1.8** Prisma 7.10 configured (`prisma.config.ts`, `pg` adapter); `postgis` + `pg_trgm` extensions in the first migration
- [x] **P1.9** Initial schema for all §16 entities (per D5), plus Session, EmailToken, Installation, UsernameHistory, ServiceArea, LocationCheck and RateLimitCounter. CHECK constraints for exactly-one target/author, vote value, required geography, no self-block. Integration tests prove each constraint rejects bad data
- [x] **P1.10** Geography columns via `Unsupported("geography")` with GiST indexes; trigram GIN index on place names. Drift check: `migrate dev` produces an empty migration, so the hand-written CHECKs persist
- [x] **P1.11** `AppConfiguration` seeded from `CONFIG_DEFAULTS` (§7 radius table, age offset 19, location freshness/accuracy, guest TTLs, session lengths, rate limits). Seeding never overwrites admin-edited values (tested). `getConfig()` treats the DB as authoritative, with a typed fallback (tested)
- [x] **P1.12** Idempotent seed (tested: running twice gives the same counts): config, achievement definitions, 5 dev places, and 3 dev users (`dev_alice`, `dev_bob`, `dev_admin`), created only when `SEED_DEV_PASSWORD` is set

**Authentication (§4.1, §4.2)**
- [x] **P1.13** Register: username (normalized and unique), email (private, lowercased), argon2id password, birth year, ToS acceptance + version, 18+ confirmation 🔒. Negative tests: `role`/`status`/`id`/`emailVerifiedAt` rejected and nothing created; an already-used email gets the identical response plus a notice email (no account disclosure); rate limit 5/h per IP; values never echoed in errors
- [x] **P1.14** Age screen on the server from `AppConfiguration` (`birthYear <= currentYear − offset`, Eastern year per D22). Tests at the year boundary (23:59:59 Dec 31 vs 00:00 Jan 1 Eastern) and with a changed offset; `422 AGE_INELIGIBLE` explains the conservative cutoff; the mobile register screen explains the 18+ rule and the birth-year purpose 🔒
- [x] **P1.15** Login (username or email), logout (this device), sign-out-everywhere. Throttling (D29): **failed** attempts only, 15/15 min per IP and 10/15 min per account. Unknown user and wrong password give the same 401, and timing is equalized. Banned, suspended and deleted accounts are refused; an expired suspension no longer blocks 🔒
- [x] **P1.16** Email verification (D11): hashed single-use tokens bound to their purpose, 24 h expiry, resend invalidates the old link (3/h). Web confirm page uses POST, so link scanners can't consume tokens. Tested live through Mailpit
- [x] **P1.17** Password reset: hashed single-use 30-minute tokens, newest link only, all sessions revoked on reset. Known and unknown emails get the identical 202; at most 3 reset emails per account per hour (anti mail-bomb) 🔒
- [x] **P1.18** `requireUser()` guard: bearer token → hashed lookup → revoked/expired check → account standing from the DB on **every** request (ban, suspension, deletion take effect immediately; a deleted account's session is revoked) → optional verified-email requirement → sliding 30-day expiry, written at most hourly. Mutation-checked: removing the ban check fails 2 tests 🔒
- [x] **P1.19** Allow-list serializers (`toPublicUser`, `toMe`) plus `findForbiddenKeys` deep scan. Tests fail if email, birthYear, passwordHash, totp secret, token hashes, internal notes or suspension data appear in public output; `/me` and login responses checked 🔒 ✅A2 (public profile half is P4.8)
- [x] **P1.20** Mobile: register, sign-in, home (in-app email code, sign-out), in-app Forgot password (D31), password fields with Show/Hide (D32), Jaguars palette (D33). **Verified on the user's Android phone 2026-10-15:** register, reset by code, sign in. Sign-out and email-code confirm are covered by server tests and live API checks
- [x] **Phase gate:** Register → verify → login → logout works on a device; auth tests pass; secrets audit clean (2026-10-15: device sign-in confirmed by user; 154 tests pass; full git history scanned for `.env` values, committed env files and key patterns: none)

## Phase 2 — Location & Directory (§6, §7, §9.1, §9.2)

**Boundary & validation**
- [x] **P2.1** Boundary polygon: Census TIGER/Line 2026 Duval County (GEOID 12031), public domain, sha256 recorded. Committed as `apps/server/data/boundaries/duval-county.geojson` (2,148 points); `npm run fetch:boundary` regenerates it. Source, version, license and refresh steps in `docs/DATA_SOURCES.md`
- [x] **P2.2** `importServiceArea()` upserts by key (`ST_MakeValid`, `ST_Multi`); `npm run import:boundary`, and the seed runs it too. Tested: importing twice leaves one row. 918.5 sq mi, matching Census land + water
- [x] **P2.3** `assertLocationEligible(actor, reading, action, target)` checks, in order: action permission by account type → account standing → mock-location flag → freshness (≤ 60 s, ≤ 30 s clock skew) → accuracy (≤ 100 m) → inside Duval → within the target radius (general 1 mi, D20; business 0.3 mi, D19). All limits come from `AppConfiguration`. Every decision is audited; it fails closed if an allowed check can't be audited (D34) 🔒
- [x] **P2.4** `test/location-eligibility.test.ts`: real places inside (downtown, Jax Beach, Atlantic Beach, Baldwin) and outside (Orange Park, Ponte Vedra, Fernandina, Atlanta, offshore); exactly-on-the-line; out of radius; stale; clock skew; inaccurate; mocked; 10 malformed readings; guest permissions; banned user; audit trail. Mutation-checked (boundary, radius, freshness) 🔒 ✅L1–L4
- [x] **P2.5** Location audit on every check, plus `runMaintenance()` (`npm run jobs:maintenance`, schedule daily): deletes location checks older than 30 days, ended sessions and used or expired email tokens older than 7 days, and expired rate-limit counters. An advisory lock prevents overlapping runs. Tested: retention boundaries, a second run deletes nothing, lock contention
- [x] **P2.6** Impossible travel (D38): each reading is compared with the actor's previous one (accuracy margins subtracted). Over 1,000 km/h across 5+ km → refused, flagged, 15-minute restriction. Over 160 km/h across 2+ km → flagged only. Mock-location readings are flagged. `LocationFlag` table for the admin view (P5.14). Tested with real scenarios: beach jump, normal drive, fast drive, a real flight, GPS jitter, lookback, per-user isolation, config 🔒
- [x] **P2.7** Server-issued installation token (`POST /api/v1/installations`, hash stored, rate-limited, no hardware IDs); the app keeps it in SecureStore and sends `X-Installation-Token`. Sessions record their installation; banned installations can't register or sign in. Tested 🔒
- [x] **P2.8** Integrity integration point: `IntegrityVerifier` interface (Play Integrity / App Attest); all installs `unverified` until credentials exist. Documented in `docs/EXTERNAL_SERVICES.md`
- [x] **P2.9** Foreground-only permission (background blocked in app config); explanation screen, then the system prompt once; Open Settings if permanently denied; account and sign-out still reachable (D16). `POST /location/status` shows "You're in Duval County" or the reason. **Confirmed on the user's Android phone 2026-10-15**

**Directory**
- [x] **P2.10** OSM import via Overpass: allow-list of public-facing tags (amenity food/drink/culture/services, shop=* except vacant, leisure parks/fitness/venues, tourism attractions/lodging, natural=beach); named features only; no offices. Tiled, polite download with backoff and a per-day tile cache
- [x] **P2.11** Idempotent upsert on (`osm`, `node/way/relation id`); dedupe by normalized name within 50 m (within the batch and against other sources); vanished places deactivated (with a truncation guard). Tested: a second run changes nothing (same IDs and timestamps), rename updates in place, deactivate/reactivate ✅D1
- [x] **P2.12** ODbL attribution: "© OpenStreetMap contributors" stored on rows, returned by the search/detail API, and shown (linked) under every place list and page in the app. Refresh steps in `docs/DATA_SOURCES.md`
- [x] **P2.13** `POST /places/search`: typo-tolerant name match (pg_trgm) or nearest first; category filter; favorites rank as if 4× closer (D39); pagination; inside Duval required (D16, D19). `POST /places/:id` detail. Tested: ordering, typos, favorites boost without overriding distance, paging without duplicates, inactive hidden, outside → 403 🔒
- [x] **P2.14** Favorites: `PUT`/`DELETE /places/:id/favorite` (idempotent, unique (user, place), capped at 200), `GET /me/favorites`. Tested: own list only (IDOR), cap, unknown/inactive → 404 🔒
- [x] **P2.15** `PATCH /me/preferences`: radii clamped to the configured min/max (§7). Tested: over max → max, under min → min, invalid/extra fields → 400 🔒
- [~] **P2.16** Places list, filters, sort, place page, favorites and Account confirmed on the user's phone. **Map view: hidden on Android (D42)** because Google Maps shows a black box in Expo Go without our own key; iPhone (Apple Maps) keeps it. *Left:* Q13 decision + development build
- [x] **Phase gate:** Location tests pass; import run twice gives the same count; search works on device (2026-10-15: user confirmed Places on the phone; the map view is tracked under P2.16)

## Phase 3 — Core Discussions (§7.1, §7.2, §7.3, §8)

- [x] **P3.1** General posts at the author's coarsened point (server-assigned, D7); feed around the reader within their radius (preference clamped to 1 mi); verified email required to post (D11). Tested 🔒
- [x] **P3.1a** Feed, post detail and comment lists need a fresh in-Duval reading; business rooms need 0.3 mi (D19). Outside → `403` with the reason; the app shows it. Tested 🔒
- [x] **P3.2** Business rooms: posts tied to a canonical place; reading, posting, commenting and voting all need 0.3 mi (D19). Place `postCount` kept in the same transaction (D41). Tested 🔒 ✅DV2
- [x] **P3.2a** Place page: info card + "Get within 0.3 mi of this place to see and join its discussion" when out of range; the room's posts when in range
- [x] **P3.3** Threaded comments and replies on both post types (max depth 3, a reply's parent must be on the same post); general comments within 1 mi of the post (D20). Deleted comments stay as placeholders. Tested 🔒 ✅DV3
- [x] **P3.4** Votes per D6: one row per (voter, item), set/change/repeat/clear, totals changed only by deltas in the same transaction under a per-(voter, item) lock (six simultaneous taps count once). Client totals rejected. Tested 🔒 ✅DV4 ✅DV5
- [x] **P3.5** Cursor pagination by (createdAt, id); tested: 20 posts, 3 added mid-scroll, second page has exactly the remaining 5; tampered cursor → 400 ✅DV6
- [x] **P3.6** Sorts: New (default), and Top (by score within 7 days, `feed.topWindowDays`). A time-decayed "hot" score can come later if Top feels stale
- [x] **P3.7** `test/write-routes.test.ts`: a table of all 34 write endpoints that **fails if a new one isn't listed**; checks 401 without a session, 400 for smuggled fields (`role`, `userId`), 403 from outside Duval, 404 for someone else's content. Mutation-checked (comment/vote radius) 🔒 ✅L5 ✅L6
- [x] **P3.8** Authors edit (marked "edited") and soft-delete their own posts and comments; anyone else gets 404. Tested 🔒
- [x] **P3.9** Block filter applied to feed, rooms, post detail and comments, in both directions (tested with `UserBlock` rows). The block/unblock UI comes in P5.2
- [x] **P3.10** Plain text only: bodies stored and returned exactly as typed (tested with `<script>`), rendered with `<Text>` (never HTML, no auto-linking); control characters rejected. Admin portal escaping is part of P5 🔒
- [~] **P3.11** App: Home = area feed (cards with teal accent; author, time, distance; body; up/down votes; comment count), New / Top this week, infinite scroll and pull to refresh, gold + button, "No posts in this area yet. Start the conversation!"; post screen with threaded comments, reply and delete; compose; place pages show their room (gold accent) or the 0.3 mi message; place rows show post counts; email confirmation moved to Account; sign-out only in Account; Duval status removed from Home. **Confirmed on the user's phone 2026-10-15:** a general post and a business-room post. *Left:* one vote and one comment on the phone to close the Phase 3 gate
- [~] **Phase gate:** End-to-end posting and voting on device in both contexts; location-bypass test suite green. *2026-10-15:* posting confirmed on the phone in both contexts; bypass suite green (write-route table, 34 endpoints). **User approved moving to Phase 4; the on-device vote/comment check is deferred**, not skipped

## Phase 4 — Guests & Profiles (§4.3, §4.4, §5, §14)

**Guests**
- [x] **P4.1** Guest session creation tied to an installation ID; rate-limited 🔒 (D44, `guests.test.ts`). App: "Continue as guest" on sign-in
- [x] **P4.2** Guest permissions: **view only** (D54; was: comment and report, D28/D51). Server rejects guest top-level posts, **votes**, business-room actions, uploads, and achievements 🔒 ✅A3. Tested: posts, votes, rooms, directory and account endpoints → 403 GUEST_NOT_ALLOWED. Upload/achievement endpoints don't exist yet (P6) and must use `requireUser`. App hides Places, and votes/new post show a sign-up prompt. Guest reports come with P5.1
- [x] **P4.3** **GUEST** label on content; internal ID never exposed 🔒 (tested; the top bar shows GUEST)
- [x] **P4.4** Guest inactivity tracked server-side; expire after 30 days; expiry warning in the UI ✅A4 (`expiringSoon` 5 days ahead; banner on Home and in Account)
- [x] **P4.5** Guest comments visible for one year, then **hard-deleted** by a scheduled job, skipping items under moderation or legal hold (D17) ✅A5. Blanked if it has replies (D45)
- [x] **P4.6** Ban carry-over: a banned installation or guest cannot create a new guest session 🔒 ✅MS4
- [-] **P4.7** Guest-to-registered upgrade path (optional; decide) → deferred (D50)

**Profiles & settings**
- [x] **P4.8** Public profile: username, avatar, bio, medals, posts and comments. No private fields 🔒 ✅A2. Tap a name to open a profile (username, bio, join date, post count, recent area posts, D49); your own Profile tab edits the bio. Forbidden-key scan on the response. Avatar → P6.2, medals → P6.9
- [x] **P4.9** Username change with configurable cooldown; immutable user ID; history kept internally ✅A1 (D46)
- [x] **P4.10** Email change (re-verify) and password change (revoke other sessions) 🔒 (D47)
- [x] **P4.11** Settings screen: radius, favorites, blocked users, my reports and their status, ToS and privacy links, location-permission guidance, logout. "My reports" is a placeholder until reports exist (P5.1); delete account is linked here
- [x] **P4.12** Account deletion: immediate login and posting disable, sessions revoked, profile hidden, `AccountDeletion` record, purge job per D14/D37 (crypto-shred after 30 days unless under legal hold; keep the email hash for banned accounts) 🔒 ✅A6 ✅A7 (D48)
- [x] **P4.13** In-app policy pages: guest expiry, deletion, and content retention (§5.1). Terms, Privacy, Guidelines and Data Retention in `@jax/shared/policies.ts`, shown in the app (Account, and from sign-up) and on the web at `/legal/<key>`. Beta text, used as-is (D52)
- [x] **Phase gate:** Guest restriction tests green; deletion workflow verified end to end. *2026-10-15:* guest and deletion/purge tests green; guest mode confirmed on the phone by the user, who approved Phase 5

## Phase 5 — Moderation & Administration (§10, §11, §9.3)

**User-facing safety**
- [x] **P5.1** Report posts, comments, profiles, images (reason categories plus details); dedupe repeated reports; per-minute + per-day report limits for users and (lower) guests (D28) 🔒 ✅MS1. `POST /reports` (10 reasons, optional details ≤1000), same 202 for new and repeat reports, advisory lock against double taps, not your own content, profiles follow block visibility, guests can't report business rooms. "My reports" list with status in Settings. App: Report on posts, comments and profiles. `reports.test.ts` (12) + write-route table. **Image reports come with photos (P6)** (D53)
- [x] **P5.2** Block and unblock users; blocked content hidden both ways ✅MS1 (built early with profiles, D49; `account.test.ts`)
- [x] **P5.3** Rate limits (D8): registration, login, posts, comments, votes, uploads, reports, submissions; daily plus per-minute plus burst; guest-specific values 🔒 ✅MS2 (D55, `rate-limits.test.ts`). Guest values: guest sessions per install/IP; guests can't write (D54). Uploads/submissions wired with P6/P5.8
- [x] **P5.4** Text screening: configurable term lists, normalization (leetspeak, spacing, homoglyphs), outcomes = allow / warn-and-confirm / hold-for-review / block. Profanity allowed by default (D56, `screening.test.ts` 26 tests). Applied to posts, comments, edits, bios and usernames. App: "Post anyway?" prompt and "Sent for review" notice. Rule editing comes with the admin portal (P5.17); slur list: Q14
- [x] **P5.5** Duplicate-content and spam detection (same text hash within a window, link-heavy posts) (D57, `spam.test.ts` 9 tests)
- [x] **P5.6** Strike system (D9); suspensions and bans enforced in `requireActor()` 🔒 ✅MS3 (D58, `enforcement.test.ts` 10 tests). Service layer + `GET /me/standing` + Account standing screen; admin buttons come with the moderation queue (P5.14)
- [x] **P5.7** Appeals and unban requests with eligibility rules (D59, `appeals.test.ts` 10 tests). Signed-in appeals from Account standing; banned/suspended people use "See why and appeal" on sign-in. Admins decide in the moderation queue (P5.14)

**Community submissions (§9.3)**
- [x] **P5.8** Submit a place: name, category, map pin (address optional), notes; boundary check; per-account limits 🔒 (D63, `submissions.test.ts`). App: Places → "Missing a place? Suggest it", Account → My suggestions
- [x] **P5.9** Duplicate candidate detection (normalized name plus proximity plus source ID) shown to the submitter and the admin ✅D2 (similar name within 300 m or anything within 20 m; other pending suggestions too; shown while typing and in the portal)
- [x] **P5.10** Submissions hidden from the public until approved ✅D3 (separate table; tested with a directory search)

**Admin portal**
- [x] **P5.11** Admin login with role check on the server for every `/admin` page and `/api/v1/admin/*` route; TOTP (D4); non-admin negative tests 🔒 ✅D8 (D60, `admin-auth.test.ts` 16 tests incl. RFC 6238 vectors and a test that walks every admin route). Portal shell: sign-in with authenticator setup, dashboard with counts of waiting work, sign out
- [x] **P5.12** Submission queue: status tabs, filters (status, category, submitter, date), inline map preview, duplicate candidates, submitter history, approve, reject (reason required), edit metadata, merge into existing, bulk select with a confirmation that lists items ✅D4 ✅D5 ✅D6 (portal /admin/submissions: status tabs, category/submitter/date filters, OSM map preview, duplicates with "Merge into this", submitter history, approve with edits, reject with reason, bulk with confirmation list)
- [x] **P5.13** Approval is idempotent: exactly one place record and one badge even on double-click or a race 🔒 ✅D5 (two simultaneous approvals: one place, one badge; tested in unit tests and the live check)
- [x] **P5.14** Moderation queues: reported posts, comments, profiles, images, with context (thread, author history); remove or restore; warn, suspend, ban; internal notes; adjust per-user rate limits; suspicious-location view. CSAM escalation path (preserve, do not delete, report to NCMEC; see R4) ✅MS3. *Done (D61, `moderation-queue.test.ts` 10 tests):* reports queue grouped by item, case page with thread context, all reports and author history, remove/approve/restore/dismiss/escalate with optional strike, user search and record (previous usernames, strikes incl. cancelled), strike/suspend/ban/lift/note/cancel strike, appeals queue, internal notes. *Deferred (D62):* per-user rate-limit adjustment, a location-flag review screen (counts are shown). Image reports come with photos (P6)
- [x] **P5.15** `ModerationAction` records reason, timestamp, admin, and target for every action (queue decisions, strikes, suspensions, bans, lifts, notes, cancellations; tested)
- [x] **P5.16** `AdminAuditLog` for every consequential admin action; viewer page ✅D7 (sign-in, 2FA setup, case decisions, strikes, user actions, appeal decisions; /admin/audit)
- [-] **P5.18** *(deferred, D62; legal hold is already set automatically by child-safety escalation, P5.14)* Legal hold (D37): set/release with reason (audited); "reveal email" with a required reason (audited); key-rotation rewrap job (`docs/KEY_MANAGEMENT.md`) 🔒
- [-] **P5.17** Admin config editor for `AppConfiguration` (validated ranges, audited) *(deferred, D62: values and screening rules are edited in the seed file or database for now)*
- [x] **Phase gate:** One admin can clear 50 seeded submissions quickly; all admin routes reject non-admins in tests. *2026-10-16:* 50 seeded suggestions bulk-approved in one action (test); every admin route walked by `admin-auth.test.ts`. P5.17/P5.18 deferred by the user (D62)

## Phase 6 — Photos & Achievements (§12, §13)

- [ ] **P6.1** Upload grant endpoint: checks auth (registered only), location, and rate limit before issuing a presigned URL to quarantine 🔒
- [ ] **P6.2** Processing: magic-byte validation, size and dimension limits, allow-list (JPEG, PNG, WebP, HEIC→JPEG), EXIF/GPS strip, re-encode with `sharp`, random storage keys 🔒
- [ ] **P6.3** Test: an uploaded image containing GPS EXIF has none after processing ✅MS5
- [ ] **P6.4** Delivery via short-lived signed URLs only; removed or private images return 403/404 🔒 ✅MS6
- [ ] **P6.5** Images reportable and removable; avatar uploads use the same pipeline
- [ ] **P6.6** Hook for future automated image classification (interface only)
- [x] **P6.7** Achievement framework: definitions in the DB, server-side evaluation, unique (user, achievement), never awarded to guests 🔒 (D64, `achievements.test.ts`)
- [x] **P6.8** Initial set: First Contribution, Approved Contributor (on submission approval), Well Received (net positive votes across N distinct posts, not raw volume) (tested: 24 h rule, removed content and banned users excluded, idempotent, 5 distinct posts vs one viral post)
- [x] **P6.9** Medals shown next to usernames and on profiles (posts, comments, profiles, Account → Profile)
- [ ] **Phase gate:** EXIF test green; unauthorized image access tests green

## Phase 7 — Verification & Release Readiness (§20, §21 P7, §22)

- [ ] **P7.1** Full automated test run; coverage report on auth, location, and admin modules
- [ ] **P7.2** Bypass test pass: spoofed coordinates, swapped user IDs, client-sent role/score/status fields, replayed stale readings 🔒
- [ ] **P7.3** Dependency audit (`pnpm audit`), secret scan of git history 🔒
- [ ] **P7.4** Migration from scratch plus backup/restore drill documented
- [ ] **P7.5** Mobile E2E for critical flows (register, post, comment, vote, report)
- [ ] **P7.6** Accessibility basics (labels, contrast, dynamic text)
- [ ] **P7.7** Every §20 criterion below checked with a linked test or manual procedure
- [ ] **P7.8** All §22 deliverables below complete
- [ ] **P7.9** Known limitations and next-steps list written
- [ ] **P7.10** App Store / Play prep: privacy nutrition labels, location usage strings, EULA zero-tolerance clause, support contact, 18+ rating, in-app account deletion (already covered)
- [ ] **Phase gate:** You sign off. **No public deployment without your explicit authorization (§1 rule 8).**

---

## Acceptance Criteria Tracker (§20)

Every row needs a linked test or a written manual procedure before it can be checked.

**Location**
- [x] L1 — Outside the boundary → cannot post or vote (P2.4 ✓ `location-eligibility.test.ts`)
- [x] L2 — Inside Jax but outside the radius → blocked (P2.4 ✓)
- [x] L3 — Valid user in radius → allowed (P2.4 ✓)
- [x] L4 — Stale, malformed, or inaccurate readings rejected (P2.4 ✓)
- [~] L5 — Tampered coordinates or user IDs can't bypass (P3.7 ✓ `write-routes.test.ts`; full bypass pass in P7.2)
- [x] L6 — Read-only browsing never enables writes (P3.7 ✓)

**Accounts & guests**
- [x] A1 — Identity persists across username changes (P4.9 ✓ `account.test.ts`)
- [x] A2 — Email and birth year never exposed (P1.19 ✓, P4.8 ✓ profile response scanned)
- [~] A3 — Guests: no top-level posts, uploads, business rooms, achievements (P4.2 ✓ posts and rooms; uploads/achievements re-check in P6)
- [x] A4 — Guests expire after 30 days inactive (P4.4 ✓ `guests.test.ts`)
- [x] A5 — Guest comments stay as GUEST for one year (P4.5 ✓)
- [x] A6 — Deleted or banned users can't participate (P4.12 ✓ deleted; P5.6 ✓ banned/suspended, `enforcement.test.ts`)
- [x] A7 — Deletion hides the profile and runs the retention workflow (P4.12 ✓)

**Discussions & voting**
- [x] DV1 — General and business discussions are distinct (P3.1, P3.2 ✓ `discussions.test.ts`)
- [x] DV2 — Business posts tied to a canonical place (P3.2 ✓)
- [x] DV3 — Replies appear under the correct parent (P3.3 ✓)
- [x] DV4 — No duplicate votes (P3.4 ✓)
- [x] DV5 — Server-side vote totals (P3.4 ✓)
- [x] DV6 — Pagination: no duplicates or skips (P3.5 ✓)

**Directory & admin**
- [ ] D1 — Import is idempotent (P2.11)
- [x] D2 — Duplicate submissions flagged (P5.9 ✓ `submissions.test.ts`)
- [x] D3 — Unapproved submissions hidden (P5.10 ✓)
- [x] D4 — Approved submission appears in the directory (P5.12 ✓)
- [x] D5 — Badge awarded only on approval, only once (P5.13 ✓ incl. simultaneous approvals)
- [x] D6 — Admin can approve, reject, correct, merge (P5.12 ✓)
- [x] D7 — Admin actions audited (P5.16 ✓ `moderation-queue.test.ts`, `admin-auth.test.ts`)
- [x] D8 — Non-admins blocked from admin (P5.11 ✓ `admin-auth.test.ts`; every admin route checked)

**Moderation & security**
- [x] MS1 — Report and block work (P5.1 ✓ `reports.test.ts`, P5.2 ✓ `account.test.ts`)
- [x] MS2 — Server-side rate limits (P5.3 ✓ `rate-limits.test.ts`; uploads/submissions re-check in P6/P5.8)
- [x] MS3 — Remove content, suspend, ban (P5.6 ✓ `enforcement.test.ts`, P5.14 ✓ `moderation-queue.test.ts`)
- [x] MS4 — Username change or new guest doesn't bypass enforcement (P4.6 ✓, P4.9 ✓ same user ID and release hold)
- [ ] MS5 — EXIF stripped (P6.3)
- [ ] MS6 — No unauthorized image or admin data access (P6.4, P5.11)
- [ ] MS7 — Automated tests cover authorization and location failures (P7.1)

---

## Deliverables Tracker (§22)

- [ ] Mobile app source
- [ ] Backend + admin portal source
- [ ] Prisma schema + migrations
- [ ] Seed + directory import scripts (idempotent)
- [x] `.env.example` (placeholders only)
- [~] `docs/SETUP.md` — local development (services, DB workflow; extend as features land)
- [~] `docs/TESTING.md` — how to run tests (test DB guard; extend as suites land)
- [~] `docs/API.md` — endpoint reference (health, auth and `/me` so far)
- [~] `docs/DATA_SOURCES.md` — attribution and refresh steps (boundary done; OSM pending P2.10)
- [ ] `docs/ARCHITECTURE.md`
- [~] `docs/UI_DESIGN.md`: color scheme and UI conventions (D33); extend as screens land
- [ ] `docs/SECURITY_PRIVACY_CHECKLIST.md`
- [x] `docs/KEY_MANAGEMENT.md`: keys, storage, backup, rotation, retention and legal hold (D35–D37)
- [ ] `docs/EXTERNAL_SERVICES.md` — services and credentials needed
- [ ] `docs/KNOWN_LIMITATIONS.md` — incomplete items, risks, next steps

---

## Risks Register

| ID | Risk | Mitigation |
|---|---|---|
| R1 | GPS spoofing can't be fully prevented (§6.2) | Layered measures: freshness, accuracy, impossible-travel checks, integrity APIs, throttling. Document this honestly |
| R2 | Ban evasion via reinstall / new guest / new email | Installation ID, integrity signals, email-domain throttles. Accept as partial |
| R3 | Birth-year screen is not age verification | Downgraded 2026-10-14 (D18): standard social-media 18+ policy, no adult content. Don't market as "verified." A routine ToS/Privacy Policy review before launch is still recommended |
| R4 | CSAM / NCMEC reporting is a federal obligation once aware | Admin escalation path (P5.14); register with NCMEC before launch; legal review |
| R5 | Scope is large for an MVP | Strict phase gates; achievements are optional (§13); defer the guest upgrade path |
| R6 | Repo inside OneDrive → sync and lock problems with node_modules | P0.5 |
| R7 | OSM data quality / completeness for Jacksonville | Community submissions fill the gaps; admin can correct entries |
| R8 | `npm audit`: 4 high advisories in `mysql2`, pulled in only by the `prisma` CLI (dev dependency). The app never connects to MySQL | The audit's suggested fix is a downgrade to Prisma 6, so it was not applied. Recheck when Prisma 7.x patches the dependency (P7.3) |
| R9 | Per-account login lockout can be triggered by anyone who knows a username (10 failed attempts per 15 min) | Only failures count; the lock lifts after the window and password reset still works. Revisit with CAPTCHA or backoff if abused |
| R10 | Losing the master encryption keys makes every stored email permanently unreadable (D35) | Offline key backup kept separately from database backups; versioned keys; documented in `docs/KEY_MANAGEMENT.md`. Choose a production secrets store before launch |

---

## Future ideas (parked, not scheduled)

Ideas the user wants remembered. Not requirements; `docs/SPEC.md` stays as written.

- **2026-10-16 — Fresher feeds:** a refresh option for the general feed and business rooms that brings in more recent posts (e.g. a "New posts" button or automatic refresh). *Today:* pull down to refresh already reloads both lists. Revisit with caching (P3 note) when there are more users.
- **2026-10-16 — Admin portal hosting:** keep it local (D62); revisit hosting and the P5.17/P5.18 screens when there are more users or more moderators.

## Out of Scope (do not build — §15, §19)

Private messaging · following · events/meetups/RSVPs · sponsored content / ads / subscriptions · push notifications · advanced analytics · recommendation algorithms · advanced reputation systems · demographic profile fields.

---

## Progress Log

| Date | Phase/Item | Note |
|---|---|---|
| 2026-10-14 | — | Spec received and saved to `docs/SPEC.md`; tracker created; open questions raised |
| 2026-10-14 | Phase 0 | Q1–Q3 answered → D15–D18 accepted, D6 confirmed. Added P3.1a (location-gated reads), P0.6. Env check: Docker installed (engine off), Node 22, npm 10, no pnpm, Git 2.26 |
| 2026-10-14 | Phase 0 | D1–D14 accepted. D19 (business rooms location-only for reads), D20 (Q4), D21 (npm). Added P3.2a. All blocking decisions resolved |
| 2026-10-14 | P0.5 / P0.6 | Files copied to the new folder. Docker Desktop open, but the engine returns HTTP 500 to `docker info` (WSL2 docker-desktop distro running). Git update not needed |
| 2026-10-14 | P0.4, Phase 0 gate | Git repo initialized (`main`); Phase 0 gate passed |
| 2026-10-14 | P1.1–P1.11, P1.12 partial | Monorepo, compose services, Next server (health, logger, env validation), Expo Router app (API client, secure store), shared schemas, Prisma 7 schema for all §16 entities with CHECK constraints, seed. 56 tests pass (shared 19, server 32, mobile 5); typecheck, lint and prettier clean; Android bundle exports. Added D22–D27, Q12, R8 |
| 2026-10-14 | Q12, D22–D24 | Q12 answered → D28 (guests can report but not vote; report limits for everyone). D22–D24 accepted |
| 2026-10-14 | P1.12–P1.19, P1.20 partial | Auth complete on the server: register, age screen, login/logout/revoke, email verification, password reset, requireUser guard, serializers, Postgres rate limiter (D8). 107 tests pass (shared 19, server 80, mobile 8); live flow verified through Mailpit; token URLs kept out of dev logs; security headers added. Mobile auth screens built; device run pending (Q8) |
| 2026-10-15 | Q8, D29 | Q8 answered (Android + Expo Go). Login per-IP limit lowered 50 → 15 and changed to count failed attempts only (D29). Test setup now explains when the database is not running. `apps/mobile/.env` points the app at this computer's Wi-Fi address |
| 2026-10-15 | P1.20 device test | First phone test failed. (1) The email-confirm page reloaded endlessly: reproduced (100+ reloads in 15 s), cleared by a dev-server restart; not reproducible afterwards (fresh server, 1–2 tabs, Expo running). A browser test of signup → Mailpit link → confirm → login now passes. Troubleshooting note in SETUP.md. (2) Login failed: the server got the right username but a different password than the one saved at signup, most likely Android auto-capitalization or autofill in a hidden field. Fix: password fields with capitalization/autocorrect off, Show/Hide toggle, confirm-password on signup. Device retest pending |
| 2026-10-15 | P1.20 device retest | Password reset from the phone did nothing: Next 16's dev server blocks its own scripts for any host but localhost, so the page opened at the Wi-Fi address never became interactive (confirmed by A/B test; server log said so too). Fix: dev-only `allowedDevOrigins` = this machine's private LAN IPs (auto-detected). Reset forms use POST so an email never lands in the URL if scripts fail. Browser test from the Wi-Fi address now delivers the reset email. D30 proposed (no user-facing web app; small account pages + admin portal) |
| 2026-10-15 | P1.16, P1.17, D31 | In-app 6-digit codes for email confirmation and password reset (migration `email_codes`, two endpoints, code box on home, in-app Forgot password screen). 132 tests pass (shared 29, server 95, mobile 8), including lockout, expiry, cross-user, purpose binding, no account disclosure and the per-IP cap; lockout mutation-checked. Live check over Wi-Fi passed after a server restart (the running dev server held a stale DB client; `db.ts` now refreshes it; SETUP note added) |
| 2026-10-15 | P1.20 device retest | Reset by code worked on the phone (password changed, email confirmed), but sign-in failed twice: correct account (`test@test.com`), non-matching password. A replay over Wi-Fi of reset-by-code plus email sign-in passed, and showed a trailing space breaks the match. D32 added (no edge spaces in new passwords; sign-in trims them). 139 tests pass |
| 2026-10-15 | P1.20, Phase 1 gate, D33 | User signed in on their phone after a reset → P1.20 done, **Phase 1 complete**. Jaguars palette + white added (`@jax/shared` theme, contrast test, mobile screens themed, `docs/UI_DESIGN.md`). Fixed a flaky privacy test (random token/UUID could contain "1990"). Full-history secrets audit clean. 154 tests pass |
| 2026-10-15 | P2.1–P2.4, P2.5 partial | Phase 2 started. Duval boundary from Census TIGER/Line 2026 (public domain) committed and imported (idempotent). `assertLocationEligible` built and covered by 45 tests (L1–L4 checked off), mutation-checked. Found and fixed: an audit failure could hide the real denial reason; allowed checks now fail closed (D34). 199 tests pass |
| 2026-10-15 | D35–D37 | Emails encrypted per user (envelope AES-256-GCM, keyed-hash lookup); birth year no longer stored; retention and legal-hold policy. Two-step migration with a verified backfill (5/5 existing users decrypt correctly). 13 encryption tests (no plaintext in a DB dump, row-swap and tamper rejected, rotation, crypto-shredding, ban hash blocks re-registration) plus env keyring checks; account-binding and keyed-hash protections mutation-checked. Found and fixed a test gap: the binding mutation initially passed, now covered. Live check passed. 219 tests pass. Added P5.18, R10, `docs/KEY_MANAGEMENT.md` |
| 2026-10-15 | P2.5–P2.16 | Retention job, impossible travel (D38), installation IDs, integrity hook, location permission flow and status check, OSM directory import (tiled and polite; public Overpass was overloaded, so backoff, tiling and a tile cache were added), search, favorites, radius preferences, app tabs (Home / Places / Account). 301 tests pass. Found and fixed: a migration was attempted after a failed schema edit (resolved as rolled back), a float parameter typed as an integer in search SQL, a helper exported from a route file. Waiting on: phone check of P2.9/P2.16, Q9 (map) |
| 2026-10-15 | P2.10, P2.11 (real data) | First real import: 4,351 OSM features → 3,742 Duval places (517 outside the county, 92 duplicates). Re-import from the saved download: 0 inserted, 0 updated, 3,742 unchanged (D1 holds on real data). Seed fixture places now only fill an empty directory; the 5 dev fixtures were set inactive in the dev DB |
| 2026-10-15 | P2 live check | Live check over Wi-Fi found the new location routes returning 500: `import.meta.dirname` is undefined inside the Next.js bundle (the tests call handlers directly and missed it). Fixed by resolving the boundary path at call time and moving file reading out of route-imported code. Added `npm run verify` (typecheck + lint + tests + production build). Live: status eligible, nearby list and "publix" search return real places |
| 2026-10-15 | P2.9 ✓, D40, Q9 | User confirmed the location flow on the phone. A "500" while loading turned out to be Metro started before new packages were installed (fixed by restarting with --clear; SETUP note). Added category groups, sort options, map limit (server, tested) and a List / Map Places screen with chips and sort (`react-native-maps`). 307 tests + production build pass; Android and iOS bundles export; live check of filters OK |
| 2026-10-15 | Phase 2 gate, Phase 3 | User confirmed Places on the phone (map view not showing: open under P2.16). Phase 3 server: feed, posts, threaded comments, votes, business rooms, edit/delete, block filter, and a write-route table test (34 endpoints). App: feed Home, post screen with comments, compose, place rooms, post counts; email code moved to Account. Live check on the dev server: post → feed → comment → vote → room post → count. 414 tests + production build pass. One test run hung in setup and didn't reproduce (3 reruns passed) |
| 2026-10-15 | P2.16, D42, D43, P4.8 (early) | User feedback: map shows a black box with the Google logo (Google key rejected in Expo Go) → Map hidden on Android, Q13 opened. Button padding fixed globally. Username + hide-on-screen toggle in every top bar. Account split into Profile (view, bio edit) and Settings tabs. New `PATCH /me/profile` (the write-route table test flagged it until listed). 422 tests + build pass |
| 2026-10-15 | D43, Q13, P3.11 | User confirmed D43 (screen-only hiding). Q13 deferred, free map preferred. Posting in the area feed and in a business room confirmed on the phone |
| 2026-10-15 | Phase 4 (P4.1–P4.13, P5.2 early, D44–D50) | Server: guest sessions (one per install, token rotation, ban carry-over), guest feed/comments with lower limits, expiry + 180-day purge, 1-year guest comment removal; username/email/password change; account deletion with 30-day crypto-shred (legal hold respected); public profiles; blocking; draft policy text served in the app and at `/legal/*`. App: Continue as guest (Places hidden, sign-up prompts for votes/posts, GUEST in top bar, expiry banner), tap a name for a profile with Block, Account settings screens (username, email with code, password, blocked users, policies, location help, delete account). 400 server tests + 28 app tests, production build and Android bundle pass. One verify run hung during tests and passed on rerun |
| 2026-10-15 | D51, D52, Phase 4 gate | User: guests are "use it right away with limited access", not out-of-town users (already true: same Duval rules). Guest commenting kept for now behind a server switch `guest.commentsEnabled` (bypass test: 403 when off; app hides the comment box). Policy text used as-is for beta, no lawyer blocker (Q11 closed). Phase 4 gate checked; Phase 5 started |
| 2026-10-15 | P5.1, D53 | Reports: `POST /reports` for posts, comments and profiles (users and guests, separate limits), dedupe with an advisory lock, `GET /me/reports`. The DB's one-target check caught an early version that also copied the author's ID onto content reports. App: report sheet (reasons, details, child-safety note), Report links on posts/comments/profiles, My reports screen. 12 new tests + write-route row. Full suite 416 passed after a Docker Desktop restart; live check OK |
| 2026-10-16 | D54, P5.3, D55 | User: guests are view-only. Server refuses guest comments and reports; the app hides comment boxes and Report links for guests; copy and retention policy updated. Rate limits: burst (10 s) for posts/comments/votes, daily vote cap, plain-language 429 message + `Retry-After`. Content-heavy test files lift burst limits via `relaxBurstLimits()`; burst rules have their own tests. 420 server tests + build + 28 app tests pass. Docker Desktop's engine failed twice mid-run (user restarted it) |
| 2026-10-16 | P5.4, D56, Q14 | Text screening: `ScreeningRule` table + migration, normalizer (accents, homoglyphs, leetspeak, stretched/spaced letters, zero-width), BLOCK/WARN/HOLD outcomes; held content hidden and auto-reported. Wired into posts, comments, edits, bio and usernames; starter threat rules seeded. App: "Post anyway?" prompt and "Sent for review" notice. 446 server tests + build + 28 app tests pass |
| 2026-10-16 | P5.5, D57 | Spam checks: duplicate text from the same person within 24 h refused (normalized, so case/spacing tricks don't help; short replies exempt); link-heavy posts and links from new accounts held with an automatic report; link-heavy edits refused. 455 server tests pass |
| 2026-10-16 | P5.6, D58 | Strikes/suspensions/bans service: D9 ladder with 180-day decay, direct suspend/ban, lift, void (for appeals); bans revoke sessions and ban the phones used; admins can't be sanctioned; maintenance ends expired suspensions. `GET /me/standing` + Account standing screen; suspension message shows the end time. Migration adds strike voiding fields. 465 server tests + build pass |
| 2026-10-16 | P5.7, D59 | Appeals: `Appeal` table + migration, eligibility rules, decide (accept voids the strike). Login's credential check extracted so the password-based appeal routes share its limits. App: Account standing shows appeal status and "Appeal this"; sign-in offers "See why and appeal" when banned or suspended. 479 server tests + build + 28 app tests pass |
| 2026-10-16 | P5.11, D60 | Admin portal sign-in: `admin:promote` command, password + authenticator (TOTP, QR setup on first sign-in, replay-proof), cookie session with CSRF, 8 h / 30 min idle, app and admin sessions kept apart. Pages: /admin/login, /admin dashboard (reports, held, appeals, submissions waiting). Admin routes get their own guard test that walks every route. 495 server tests + build pass; live: /admin redirects to sign-in, admin API 401 without a session |
| 2026-10-16 | P5.14 (most), P5.15, P5.16, D61 | Moderation in the admin portal: reports queue grouped by item (urgent first), case page with context and author history, remove/approve/restore/dismiss/child-safety escalate with optional strike, user search + record + strike/suspend/ban/lift/note/cancel, appeals queue, audit log page. Every decision writes a ModerationAction and an audit entry. 505 server tests + build pass; live: all admin pages render with a temporary admin session (removed afterwards) |
| 2026-10-16 | D62, live E2E, checklist | User: admin portal is desktop-only and local for now; don't over-engineer (P5.17, P5.18 and P5.14 extras deferred). New `npm run e2e:live`: temporary accounts exercise the whole app over HTTP against the dev server (sign-up via Mailpit codes, guests, posts, rooms, blocks, screening, spam, reports, account changes, admin portal with TOTP, strikes, suspension, appeal, ban, deletion) and clean up after themselves: **82/82 passed**, dev database verified clean. On-phone checklist written (`docs/MANUAL_TESTS.md`). Feed-refresh idea parked under Future ideas |
| 2026-10-16 | P5.8–P5.13, D63, Phase 5 gate | Place suggestions: suggest from where you stand (no map needed), duplicate check while typing, risk limits, screening; admin queue with tabs, filters, OSM map preview, duplicates/merge, approve with corrections, reject with reason, bulk with confirmation; approval creates one place and one badge even when clicked twice at once. 526 server tests + build pass; live check extended to 91 checks, **91/91 passed**, dev database verified clean afterwards. Phase 5 gate met |
| 2026-10-16 | P6.7–P6.9, D64 | Achievements: SQL-based idempotent awarding from DB definitions (First Contribution after 24 h, Well Received across 5 distinct well-liked posts, Approved Contributor on approval), evaluated on upvotes and in the daily job; medals next to names on posts/comments and on profiles. 532 server tests + 28 app tests pass |
