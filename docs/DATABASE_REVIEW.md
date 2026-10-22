# Database Review — Postgres (2026-10-21)

Scope: `apps/server/prisma/schema.prisma`, all 21 migrations, the server query code in `apps/server/src/server/`, and a catalog check against the running dev database (Postgres 17.5 + PostGIS 3.5). Nothing was changed. This is a review only.

**Bottom line:** The schema is well built for this app. One managed Postgres database (with PostGIS) is enough for a Jacksonville-only user base. You don't need a second database product. The problems are fixable with migrations: missing indexes on foreign keys, a few tables whose old rows are deleted inefficiently, and a few tables with no cleanup at all.

---

## 1. Sizing assumptions

Duval County has about 1M residents. These estimates use a planning case of **50,000 accounts and 10,000 daily active users (DAU)**, roughly 1% of the county using it daily. They are rough ranges for planning only. Recheck them against real traffic after launch with `pg_stat_user_tables`.

| Activity per active user per day                             | Assumed |
| ------------------------------------------------------------ | ------- |
| Feed / room / place reads (each one writes a location check) | ~25     |
| Votes                                                        | ~15     |
| Comments                                                     | ~3      |
| Posts                                                        | ~0.3    |
| Private messages (40% of users message, ~30 each)            | ~12 avg |

---

## 2. What's already good

- **Every write to a vote total is safe.** Vote counts are changed only in `castVote`, under an advisory lock, in the same transaction as the vote row. The counters can't drift, and the `CHECK (… >= 0)` constraints back this up.
- **The database enforces its own rules.** "Exactly one target" rules (Report, Vote, Comment, PlaceChangeVote, LocationCheck) are `CHECK` constraints. Friendship and Conversation pairs are stored in sorted order (`userLowId < userHighId`) with a unique index, so duplicate pairs are impossible.
- **Feed paging uses keyset cursors** (`createdAt, id`), not OFFSET, on the main feed, place rooms and chats. Page speed stays flat as tables grow. The one exception is "Top" sort (see §4).
- **Geography is done right.** `geography` columns have GiST indexes. The feed uses `ST_DWithin`, which can use the index. Posts store only a coarsened (~100 m) point.
- **Text search on places uses a trigram (pg_trgm) GIN index.**
- **Sensitive data is protected inside the database.** Emails and message bodies are encrypted, with a key per user or chat that can be destroyed. Only hashes of tokens are stored. `LocationFlag` holds no coordinates.
- **There is already a daily cleanup job** with an advisory lock so two runs can't overlap. It covers location checks, sessions, email tokens, rate limits, guests, guest comments, deleted accounts, unused photos, notifications, place changes and message evidence.
- **"Last seen" writes are throttled.** Sessions and guests are touched at most once an hour, not on every request, which avoids needless row updates.
- **All timestamps are `timestamptz`, and Prisma's default IDs are UUIDv7.** Sorted-by-time IDs keep insert performance good.

---

## 3. Issues found (most important first)

### 3.1 HIGH — Foreign keys with no index (26 found)

Postgres does **not** index foreign key columns automatically. When a parent row is deleted, Postgres must find the child rows. With no index, it reads the whole child table for every deleted row. These deletes happen today: the guest-comment purge, post deletion, account purge and message deletion.

The ones that matter, in order:

| Table.column                                                                                                                                                                                                                                                                  | Why it matters                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Vote.generalPostId`, `Vote.businessPostId`, `Vote.commentId`                                                                                                                                                                                                                 | **Most important.** Vote will be one of the largest tables. Deleting one comment or post reads all of Vote. The existing unique indexes start with `voterId`, so they don't help here. |
| `ModerationAction.generalPostId / businessPostId / commentId / photoId / reportId / submissionId`                                                                                                                                                                             | Every comment or post delete also reads all of ModerationAction (to set these to NULL). The admin case pages also look actions up by target.                                           |
| `Report.messageId`, `Report.reporterUserId`, `Report.reporterGuestId`, `Report.resolvedById`                                                                                                                                                                                  | Message deletes, account purges and guest purges each read all of Report. "My reports" queries need `reporterUserId`.                                                                  |
| `MessageHide.userId`                                                                                                                                                                                                                                                          | Account deletion reads the whole table.                                                                                                                                                |
| `Notification.actorId`                                                                                                                                                                                                                                                        | Account deletion reads the whole table.                                                                                                                                                |
| `PlaceRemoval.requesterId`, `BusinessSubmission.placeId / reviewerId`, `ContactMessage.guestSessionId / resolvedById`, `LocationCheck.installationId`, `OwnerClaim.decidedById`, `LocationFlag.reviewedById`, `AppConfiguration.updatedById`, `UserAchievement.achievementId` | Small tables, or the parent is rarely deleted. These are low priority, but cheap to add.                                                                                               |

**Fix:** use partial indexes so NULL rows take no space, for example `CREATE INDEX CONCURRENTLY ... ON "Vote" ("commentId") WHERE "commentId" IS NOT NULL;`. The full list is in §5.

### 3.2 HIGH — The busiest tables get random (v4) IDs

The schema promises UUIDv7, but raw-SQL inserts use `gen_random_uuid()`, which makes **v4** (random) IDs:

- `discussions/posts.ts:317`: **GeneralPost**
- `location/eligibility.ts:312`: **LocationCheck**, the table with the most inserts
- `directory/submissions.ts:170, 295`, `directory/osm.ts:303`, `location/service-area.ts:16`

Random IDs insert all over the primary-key index instead of at its end. That causes page splits, a larger index and more disk I/O on exactly the tables that grow fastest.

**Fix:** pass `uuidv7()` from `crypto/uuid.ts`, which already exists, into these inserts. Postgres 18 has a native `uuidv7()` if production runs 18.

### 3.3 HIGH — LocationCheck: largest table, cleaned up with a bulk DELETE

Every gated request writes a row, including **every feed page load**. Estimate: ~250k rows a day and ~7–8M rows at steady state with 30-day retention. The daily job removes old rows with one `DELETE` inside one long transaction. At this size that:

- creates millions of dead rows for vacuum to clean up, so the table and its indexes bloat;
- holds a single transaction for the whole maintenance run, which has a 120 s timeout. Every other cleanup step runs inside it too.

**Fix:** partition `LocationCheck` by day or week on `receivedAt`, and drop whole partitions after 30 days. Dropping a partition is instant and leaves nothing for vacuum. Alternatives:

- Delete in batches of 5–10k rows, each in its own transaction.
- Reconsider whether **allowed reads** (`general.read`, `business.read`) need a full precise row at all. Logging denials, and only posts, comments and votes, would cut volume by roughly 80%. Changing this would deviate from D7, so it needs a Decision Log entry.

### 3.4 MEDIUM — RateLimitCounter: constant inserts and updates, cleaned only daily

Each limited request upserts 1–2 rows per rule (2 when staggered windows apply). Short windows create a new row every minute per key, and expired rows wait up to 24 h for the daily cleanup. Constant updates to the same rows also cause bloat.

**Fix (pick one or more, cheapest first):**

- Run the expired-counter delete every 5–15 minutes, separate from the daily job.
- Make it an `UNLOGGED` table. Counters don't need crash safety, and writes get ~2–3× cheaper.
- Set `fillfactor = 70` so updates can happen in place.
- Move counters to Redis only if Postgres metrics later show them as a hotspot. Not needed at launch.

### 3.5 MEDIUM — Tables that grow forever

These have no cleanup today:

| Table                                                                       | What builds up                                                                                         |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Message**                                                                 | Every chat message, forever, unless the sender deletes their account. Expect ~120k a day, 40M+ a year. |
| **GeneralPost / BusinessPost / Comment** with status `DELETED` or `REMOVED` | Soft-deleted rows stay forever, **and so do all their votes, photos and reports**.                     |
| **Photo** with status `REMOVED` / `REJECTED`                                | Rows (and possibly the stored files) are never deleted. Only _unused_ uploads are purged.              |
| **LocationFlag**                                                            | Speed/distance flags, never purged.                                                                    |
| **Installation**                                                            | One row per app install, never purged, even after years without activity.                              |
| **AdminAuditLog**, **ModerationAction**                                     | Keeping these long-term is fine, but set a written policy (for example, keep 3 years).                 |

The retention periods themselves are your call; §7 suggests some. Each one becomes a Decision Log entry.

### 3.6 MEDIUM — Query patterns that won't scale

- **`listConversations` makes one query per chat** (`social/messages.ts:311`). It fetches the last message and runs `canMessage` separately for each conversation. 50 chats means ~100+ round trips per call, and the app polls it. Fix: one query with a `LATERAL` join for the last message, or store `lastMessageId` on `Conversation`.
- **Username prefix search can't use the index.** The database collation is `en_US.utf8`, so `"usernameNormalized" LIKE 'abc%'` (feed search, friend search) can't use the unique B-tree index. Fix: add `CREATE INDEX ... ("usernameNormalized" varchar_pattern_ops)`.
- **Feed "Top" sort uses `OFFSET`.** It gets slower with each page. That's acceptable because it's limited to a 7-day window, but keep an eye on it.
- **Feed text search** (`p.body ILIKE '%q%'`) has no index. It's limited to the reader's radius, so it's OK for now. Add a trigram GIN index on `body` only if search becomes heavily used.
- **Each feed row runs 5 small subqueries** (3 for media, 1 for medals, 1 for owner check). They are all indexed and fine at a page size of 15. Watch them if the page size grows.

### 3.7 LOW — Indexes that could be tighter

| Today                                 | Better                                                                             |
| ------------------------------------- | ---------------------------------------------------------------------------------- |
| `Notification (userId, readAt)`       | `(userId) WHERE "readAt" IS NULL`: the unread-badge query only needs unread rows   |
| _(none)_                              | `Notification (createdAt)` for the purge, or move to the shorter retention in §7   |
| `Comment (authorKind, createdAt)`     | `(createdAt) WHERE "authorKind" = 'GUEST'`: only the guest purge uses it           |
| `Report (status, createdAt)`          | `(createdAt) WHERE status = 'OPEN'`: the admin queue only lists open reports       |
| `Message (conversationId, createdAt)` | `(conversationId, createdAt DESC, id DESC)` to match the chat's sort order exactly |

### 3.8 LOW — Extra extensions in the dev database

Dev has `postgis_tiger_geocoder`, `postgis_topology` and `fuzzystrmatch`, plus their tables (`place`, `addr`, `bg`, …). They come from the Docker image, not from our migrations. Production should have **only** `postgis` and `pg_trgm`. Many managed providers don't offer tiger at all.

### 3.9 LOW — Connection pooling isn't configured

`db.ts` uses Prisma's `pg` adapter with its default pool (about 10 connections per server process). With several Next.js instances, or any serverless runtime, connections multiply quickly. In production, put a pooler in front of Postgres (PgBouncer in transaction mode, or the provider's built-in pooler) and set the pool size explicitly.

---

## 4. Normalization review

The schema is mostly in 3rd normal form. The repeated fields that do exist (vote totals, `postCount`, `commentCount`, `lastMessageAt`) are **deliberate**: they are maintained in the same transaction and save a count on every read. Keep them.

| Area                                                                       | What I see                                                                                          | Recommendation                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **GeneralPost + BusinessPost** are two near-identical tables               | So Comment, Vote, Photo, Report and ModerationAction each need two post columns.                    | **Leave as is for now.** Merging them into one `Post` table would simplify five tables, but it's a big refactor and the split comes from the spec (§2). Revisit only if a third post type appears.                                    |
| **Vote, Report, ModerationAction use one nullable column per target type** | This works and is enforced by `CHECK`. Each new target type adds a column and an index.             | Keep it. Add the indexes from §3.1.                                                                                                                                                                                                   |
| **User is a wide table**                                                   | It mixes login, admin 2FA (`totp*`), legal hold, and preferences (radii, color, hide-from-friends). | **Worth doing before launch:** move admin 2FA into `AdminCredential (userId PK)` and preferences into `UserSettings (userId PK)`. The User row is read on every request, so smaller is better, and the 2FA secret gets its own table. |
| **AutoSuspension stores post IDs in `uuid[]` arrays**                      | The database can't check these IDs (no foreign keys).                                               | Optional: an `AutoSuspensionHeldPost` join table. It's a low-volume table, so this is low priority.                                                                                                                                   |
| **`BusinessPlace.category` is free text**                                  | Categories come from the OSM import, so spelling can drift.                                         | Optional: a `PlaceCategory` lookup table (key, label, color) used by both the map and filters.                                                                                                                                        |
| **`score` always equals `upCount − downCount`**                            | The same fact is stored twice.                                                                      | Optional: a `GENERATED ALWAYS AS (…) STORED` column, so it can never disagree with the counts.                                                                                                                                        |
| **Photo holds images, voice and video**                                    | Only the name is misleading.                                                                        | Cosmetic. Rename to `Media` only if you're touching it anyway.                                                                                                                                                                        |
| **BusinessSubmission repeats BusinessPlace's fields**                      | This is correct: it's a draft, not a copy.                                                          | Keep.                                                                                                                                                                                                                                 |
| **AdminAuditLog.targetId has no foreign key**                              | This is correct: an audit log has to keep its record after the target is deleted.                   | Keep.                                                                                                                                                                                                                                 |

---

## 5. Missing indexes: proposed migration

Use `CREATE INDEX CONCURRENTLY` in production so tables aren't locked. Prisma migrations run inside a transaction, so put these in their own migration with one statement each, or run them manually before deploying.

```sql
-- High priority (§3.1)
CREATE INDEX CONCURRENTLY "Vote_generalPostId_idx"  ON "Vote" ("generalPostId")  WHERE "generalPostId"  IS NOT NULL;
CREATE INDEX CONCURRENTLY "Vote_businessPostId_idx" ON "Vote" ("businessPostId") WHERE "businessPostId" IS NOT NULL;
CREATE INDEX CONCURRENTLY "Vote_commentId_idx"      ON "Vote" ("commentId")      WHERE "commentId"      IS NOT NULL;

CREATE INDEX CONCURRENTLY "ModerationAction_generalPostId_idx"  ON "ModerationAction" ("generalPostId")  WHERE "generalPostId"  IS NOT NULL;
CREATE INDEX CONCURRENTLY "ModerationAction_businessPostId_idx" ON "ModerationAction" ("businessPostId") WHERE "businessPostId" IS NOT NULL;
CREATE INDEX CONCURRENTLY "ModerationAction_commentId_idx"      ON "ModerationAction" ("commentId")      WHERE "commentId"      IS NOT NULL;
CREATE INDEX CONCURRENTLY "ModerationAction_photoId_idx"        ON "ModerationAction" ("photoId")        WHERE "photoId"        IS NOT NULL;
CREATE INDEX CONCURRENTLY "ModerationAction_reportId_idx"       ON "ModerationAction" ("reportId")       WHERE "reportId"       IS NOT NULL;
CREATE INDEX CONCURRENTLY "ModerationAction_submissionId_idx"   ON "ModerationAction" ("submissionId")   WHERE "submissionId"   IS NOT NULL;

CREATE INDEX CONCURRENTLY "Report_messageId_idx"       ON "Report" ("messageId")       WHERE "messageId"       IS NOT NULL;
CREATE INDEX CONCURRENTLY "Report_reporterUserId_idx"  ON "Report" ("reporterUserId", "createdAt");
CREATE INDEX CONCURRENTLY "Report_reporterGuestId_idx" ON "Report" ("reporterGuestId") WHERE "reporterGuestId" IS NOT NULL;

CREATE INDEX CONCURRENTLY "MessageHide_userId_idx"     ON "MessageHide" ("userId");
CREATE INDEX CONCURRENTLY "Notification_actorId_idx"   ON "Notification" ("actorId") WHERE "actorId" IS NOT NULL;

-- Query speed (§3.6)
CREATE INDEX CONCURRENTLY "User_usernameNormalized_prefix_idx" ON "User" ("usernameNormalized" varchar_pattern_ops);

-- Low priority (cheap; parents are rarely deleted)
CREATE INDEX CONCURRENTLY "PlaceRemoval_requesterId_idx"        ON "PlaceRemoval" ("requesterId");
CREATE INDEX CONCURRENTLY "BusinessSubmission_placeId_idx"      ON "BusinessSubmission" ("placeId") WHERE "placeId" IS NOT NULL;
CREATE INDEX CONCURRENTLY "ContactMessage_guestSessionId_idx"   ON "ContactMessage" ("guestSessionId") WHERE "guestSessionId" IS NOT NULL;
CREATE INDEX CONCURRENTLY "LocationCheck_installationId_idx"    ON "LocationCheck" ("installationId") WHERE "installationId" IS NOT NULL;
```

The Prisma schema needs matching `@@index` lines, or a note that these live in raw SQL, so `prisma migrate diff` doesn't try to drop them.

---

## 6. Every table: purpose and expected volume

**Volume levels:** High = millions of rows a year, or constant inserts and updates. Medium = hundreds of thousands to low millions. Low = thousands or fewer, or a reference table.

### Identity & sessions

| Table           | What it's for                                                          | Volume               | Notes                                           |
| --------------- | ---------------------------------------------------------------------- | -------------------- | ----------------------------------------------- |
| User            | Accounts: login, role, status, encrypted email, admin 2FA, preferences | Low–Med (~50k)       | Read on every request; see the split idea in §4 |
| UsernameHistory | Past usernames (cooldown and abuse review)                             | Low                  |                                                 |
| Session         | Server-side login sessions (mobile + admin)                            | Medium               | Auto-purged                                     |
| EmailToken      | Email verify / reset / email-change links and codes                    | Low–Med              | Auto-purged                                     |
| Installation    | One row per app install (ban carry-over)                               | Medium               | Never purged                                    |
| GuestSession    | Guest (no-account) sessions on an install                              | Medium               | Auto-expire + purge                             |
| Profile         | Bio + avatar                                                           | Low–Med (1 per user) |                                                 |

### Location

| Table             | What it's for                                 | Volume                                      | Notes                   |
| ----------------- | --------------------------------------------- | ------------------------------------------- | ----------------------- |
| ServiceArea       | The Duval County boundary polygon             | Low (1 row)                                 |                         |
| **LocationCheck** | Precise location audit for every gated action | **HIGH: largest** (~250k a day, ~7–8M kept) | Partition + drop (§3.3) |
| LocationFlag      | Suspicious-travel flags for admin review      | Low                                         | No retention yet        |

### Directory (places)

| Table              | What it's for                                         | Volume          | Notes                     |
| ------------------ | ----------------------------------------------------- | --------------- | ------------------------- |
| BusinessPlace      | Businesses/places (OSM import + approved submissions) | Low (~4.6k now) | Mostly read               |
| BusinessSubmission | User-suggested new places                             | Low             | Status expires at 60 days |
| PlaceRemoval       | "This place closed" requests                          | Low             | Status expires at 60 days |
| PlaceChangeVote    | Votes on suggestions and removals                     | Low–Med         |                           |
| OwnerClaim         | Business-owner verification                           | Low             |                           |
| FavoritePlace      | A user's saved places                                 | Medium          |                           |

### Discussions

| Table        | What it's for                                                                | Volume                              | Notes                                 |
| ------------ | ---------------------------------------------------------------------------- | ----------------------------------- | ------------------------------------- |
| GeneralPost  | Area feed posts                                                              | Medium (~1M a year)                 | Soft-deleted rows stay forever        |
| BusinessPost | Place-room posts                                                             | Medium                              | Same                                  |
| Comment      | Comments on either post type (user or guest)                                 | Med–High (~10M a year)              | Guest comments auto-removed at 1 year |
| **Vote**     | One up/down vote per user per post or comment                                | **HIGH** (~150k a day, ~50M a year) | Missing FK indexes (§3.1)             |
| Photo        | Metadata for uploaded media (image/voice/video); files are in object storage | Medium                              | Removed/rejected rows not purged      |

### Achievements

| Table           | What it's for           | Volume          | Notes |
| --------------- | ----------------------- | --------------- | ----- |
| Achievement     | Medal definitions       | Low (reference) |       |
| UserAchievement | Medals each user earned | Low–Med         |       |

### Social & messaging

| Table              | What it's for                                           | Volume                              | Notes                                |
| ------------------ | ------------------------------------------------------- | ----------------------------------- | ------------------------------------ |
| Friendship         | Friend requests and friendships (one row per pair)      | Medium                              |                                      |
| Notification       | The in-app bell (friend request / accepted)             | Medium                              | Auto-purged at 90 days               |
| UserBlock          | Who blocked whom                                        | Low–Med                             |                                      |
| Conversation       | One private chat per friend pair + its encryption key   | Medium                              |                                      |
| ConversationMember | Per-person chat state (last read, "delete chat for me") | Medium                              |                                      |
| **Message**        | Encrypted private messages                              | **HIGH** (~120k a day, 40M+ a year) | No retention; N+1 query in chat list |
| MessageHide        | "Delete for me" on single messages                      | Low–Med                             |                                      |
| GuideSeen          | Which first-time guides a user dismissed                | Low                                 |                                      |
| ContactMessage     | "Contact us" tickets                                    | Low                                 |                                      |

### Safety & moderation

| Table            | What it's for                                           | Volume          | Notes                              |
| ---------------- | ------------------------------------------------------- | --------------- | ---------------------------------- |
| Report           | User reports (posts, comments, photos, users, messages) | Low–Med         | Message evidence cleared at 1 year |
| ModerationAction | Every moderator decision and strike                     | Low–Med         | Missing FK indexes (§3.1)          |
| AutoSuspension   | Automatic suspensions after many reports                | Low             |                                    |
| Appeal           | Strike appeals                                          | Low             |                                    |
| AccountDeletion  | Deletion requests + purge schedule                      | Low             | Drives crypto-shredding            |
| AdminAuditLog    | Log of every admin action                               | Low–Med         | Keep long-term                     |
| ScreeningRule    | Word/phrase filter rules                                | Low (reference) |                                    |

### Config & infrastructure

| Table                | What it's for                                    | Volume                                                   | Notes                              |
| -------------------- | ------------------------------------------------ | -------------------------------------------------------- | ---------------------------------- |
| AppConfiguration     | Server settings that can change without a deploy | Low (reference)                                          |                                    |
| **RateLimitCounter** | Rate-limit counters                              | **HIGH churn** (small, but constant inserts and updates) | Purge more often / UNLOGGED (§3.4) |

---

## 7. Tables that need automatic row deletion

✅ = the daily job already does it · ⚠️ = needs work · ➕ = suggested new rule (each needs a Decision Log entry; it's your call)

| Table                                                 | Rule today                                      | Recommendation                                                                                                                                                           |
| ----------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **LocationCheck**                                     | ✅ Delete older than 30 days, daily             | ⚠️ Same rule, but via **dropping partitions** (§3.3)                                                                                                                     |
| **RateLimitCounter**                                  | ✅ Delete expired rows, daily                   | ⚠️ Run **every 5–15 min**                                                                                                                                                |
| **Notification**                                      | ✅ Delete older than 90 days (D76)              | ➕ Your idea: **delete read notifications after 7 days** (or right after they're seen) **and unread ones after 30 days**. This changes D76.                              |
| Session                                               | ✅ Expired/revoked + 7 days                     | OK                                                                                                                                                                       |
| EmailToken                                            | ✅ Used/expired + 7 days                        | OK                                                                                                                                                                       |
| GuestSession                                          | ✅ Expire at 30 days idle, purge 180 days later | OK                                                                                                                                                                       |
| Comment (guest)                                       | ✅ Removed after 365 days                       | OK                                                                                                                                                                       |
| Photo (unused uploads)                                | ✅ After 1 day                                  | ➕ Also delete `REMOVED`/`REJECTED` rows **and their files** after ~30 days (keep if a report is open)                                                                   |
| Report.messageEvidence                                | ✅ Cleared after 1 year                         | OK                                                                                                                                                                       |
| BusinessPost (removed places)                         | ✅ After 90 days                                | OK                                                                                                                                                                       |
| User (deleted accounts)                               | ✅ Crypto-shred after 30 days                   | OK                                                                                                                                                                       |
| GeneralPost / BusinessPost / Comment marked `DELETED` | ❌ Never                                        | ➕ Hard-delete about 30 days after the author deletes them. This also removes their votes and attachments. Keep `REMOVED` (moderation) longer, e.g. 1 year, as evidence. |
| Message                                               | ❌ Never                                        | ➕ Decide on a policy. Options: keep forever (normal for chat apps); delete unsent messages' rows after 15 min + 1 day; or delete after N years.                         |
| LocationFlag                                          | ❌ Never                                        | ➕ Delete reviewed flags after 1 year                                                                                                                                    |
| Installation                                          | ❌ Never                                        | ➕ Delete if not seen for 1 year and not banned                                                                                                                          |
| ContactMessage                                        | ❌ Never                                        | ➕ Delete resolved tickets after 1–2 years                                                                                                                               |
| AdminAuditLog / ModerationAction                      | ❌ Never                                        | ➕ Keep 3+ years (written policy), then archive                                                                                                                          |
| PlaceRemoval / BusinessSubmission                     | ✅ Status → EXPIRED at 60 days                  | Rows stay (small). OK                                                                                                                                                    |

Two more maintenance-job points:

- **Batch large deletes.** At the volumes above, run each purge as its own short transaction and delete in chunks, instead of one transaction for the whole job.
- **Split the schedule.** Run rate-limit cleanup every few minutes. Keep everything else daily.

---

## 8. Where to store the data (SaaS options)

**Recommendation: one managed Postgres database is enough for everything at Jacksonville scale.** In the planning case it holds roughly 20–40 GB after the first year, mostly Vote, Message, Comment and LocationCheck. A single mid-size instance handles this easily. Don't add Mongo, Cassandra, a time-series database, Elasticsearch or a separate queue for this app.

| Data                                     | Where                                                        | Why                                                                                                                                                      |
| ---------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Everything relational (all tables above) | **Managed Postgres with PostGIS**                            | PostGIS is required. Must-haves: point-in-time recovery, automatic backups, a built-in connection pooler, a read replica later if needed.                |
| Photos, voice, video files               | **S3-compatible object storage** (already designed this way) | Cheap, and the database stores only keys. Cloudflare R2 has no download (egress) fees, which suits a media-heavy app. AWS S3 and Backblaze B2 also work. |
| Rate-limit counters                      | **Postgres for now** (with the fixes in §3.4)                | Move to Redis (e.g. Upstash, or the provider's Redis) only if metrics show it's needed.                                                                  |
| LocationCheck audit                      | **Postgres, partitioned**                                    | No separate store needed at this size.                                                                                                                   |
| Application logs                         | The hosting provider's log service                           | Keep logs out of the database.                                                                                                                           |

**Managed Postgres providers that support PostGIS and pg_trgm:** Supabase, Neon, AWS RDS / Aurora PostgreSQL, DigitalOcean Managed PostgreSQL, Crunchy Bridge, Google Cloud SQL. For a small team, Supabase, Neon or DigitalOcean are the simplest. RDS or Aurora gives the most control but takes more setup. Check current pricing and plan limits before choosing. Per CLAUDE.md, no paid service is set up without your approval.

---

## 9. Suggestions before moving forward

1. **Do the cheap high-impact fixes first, in one migration:** the §5 indexes, and switching the raw inserts to `uuidv7()` (§3.2). Low risk; large benefit later.
2. **Decide retention policies** (§7): notifications, soft-deleted posts, messages, flags, installations. Each choice gets a Decision Log entry. Add them as Open Questions in `PROJECT_PLAN.md` until decided.
3. **Partition LocationCheck before launch.** Partitioning an empty table is easy; doing it later with millions of rows is a real project. While deciding, reconsider whether every allowed feed read needs a precise audit row (D7).
4. **Fix the `listConversations` per-chat queries** before messaging gets real use.
5. **Split `User`** into `AdminCredential` and `UserSettings` while the table is still empty in production.
6. **Load-test with realistic data.** Seed ~50k users, ~1M posts and ~20M votes into a scratch database. Then run `EXPLAIN (ANALYZE, BUFFERS)` on the feed, the place room, the chat list and the admin queue. This turns the estimates in this file into measurements.
7. **Production settings to plan for:** a connection pooler; `statement_timeout` (e.g. 10 s for the app role); `idle_in_transaction_session_timeout`; the `pg_stat_statements` extension to find slow queries; autovacuum tuned more aggressively on Vote, Message, LocationCheck and RateLimitCounter.
8. **Production extensions:** only `postgis` and `pg_trgm` (§3.8).
9. **Safe migrations:** use `CREATE INDEX CONCURRENTLY`, and add constraints with `NOT VALID` and then `VALIDATE`, so deploys don't lock busy tables.
