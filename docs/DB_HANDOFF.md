# Database Work — Handoff to the Dev Agent

**From:** database review of 2026-10-21. The full reasoning, volume estimates and per-table list are in [DATABASE_REVIEW.md](DATABASE_REVIEW.md). This file only lists **what to change**.

**Ground rules (from CLAUDE.md):**

- Follow the normal tracker workflow: add items to `PROJECT_PLAN.md`, write tests, mark `[x]` only when tests pass, and update the Progress Log.
- Anything that changes the spec or an existing decision gets a **Decision Log entry first**. The next free number is **D106**.
- Tasks in **Part B** need the user's decision before you build them. Add them to **Open Questions** and wait.
- Production has no data yet. Plain `CREATE INDEX` in a normal Prisma migration is fine **now**. After launch, index changes must use `CREATE INDEX CONCURRENTLY` in a separate migration.

---

## Part A — Do now (no user decision needed)

### A1. Add the missing foreign-key indexes · priority HIGH

Postgres does not index foreign keys on its own. When a parent row is deleted, every child table without one of these indexes is read in full. This happens today in the guest-comment purge, post deletes, account purge and message deletes. The worst case is `Vote`, which will be one of the largest tables.

Add to `apps/server/prisma/schema.prisma`, then generate one migration (suggested name: `fk_indexes`):

| Model              | Add                                                                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vote               | `@@index([generalPostId])`, `@@index([businessPostId])`, `@@index([commentId])`                                                                         |
| ModerationAction   | `@@index([generalPostId])`, `@@index([businessPostId])`, `@@index([commentId])`, `@@index([photoId])`, `@@index([reportId])`, `@@index([submissionId])` |
| Report             | `@@index([messageId])`, `@@index([reporterUserId, createdAt])`, `@@index([reporterGuestId])`, `@@index([resolvedById])`                                 |
| MessageHide        | `@@index([userId])`                                                                                                                                     |
| Notification       | `@@index([actorId])`                                                                                                                                    |
| PlaceRemoval       | `@@index([requesterId])`                                                                                                                                |
| BusinessSubmission | `@@index([placeId])`, `@@index([reviewerId])`                                                                                                           |
| ContactMessage     | `@@index([guestSessionId])`                                                                                                                             |
| LocationCheck      | `@@index([installationId])`                                                                                                                             |

Notes:

- **Partial indexes** (`WHERE col IS NOT NULL`) would be smaller, because most of these columns are NULL on most rows. Use them only if Prisma 7.10 can express them in the schema. Otherwise `prisma migrate dev` will see drift and try to drop them. Plain `@@index` is fine at our scale; don't fight Prisma for this.
- **Check:** run this query in the dev database. After the migration it should return only the low-priority leftovers (`AppConfiguration.updatedById`, `LocationFlag.reviewedById`, `OwnerClaim.decidedById`, `ContactMessage.resolvedById`, `PlaceRemoval.resolvedById`, `UserAchievement.achievementId`). Index those too if it's simple.

```sql
SELECT c.conrelid::regclass AS tbl, string_agg(a.attname, ',') AS fk_cols
FROM pg_constraint c
CROSS JOIN LATERAL unnest(c.conkey) x(attnum)
JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = x.attnum
WHERE c.contype = 'f' AND NOT EXISTS (
  SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid
    AND (i.indkey::int2[])[0:array_length(c.conkey,1)-1] @> c.conkey
    AND (i.indkey::int2[])[0:array_length(c.conkey,1)-1] <@ c.conkey)
GROUP BY c.conrelid, c.conname ORDER BY 1;
```

- **Test:** add a case to `apps/server/test/schema-constraints.test.ts` that runs the query above and expects no rows, apart from an explicit allow-list. That stops future migrations from adding unindexed foreign keys.

### A2. Use UUIDv7 in raw-SQL inserts · priority HIGH

The schema convention is UUIDv7 (time-ordered), but these raw inserts use `gen_random_uuid()`, which makes **v4** (random) IDs. Random IDs fragment the primary-key index on the fastest-growing tables (`LocationCheck`, `GeneralPost`).

Replace `gen_random_uuid()` with a parameter `${uuidv7()}::uuid`, using `uuidv7` from `apps/server/src/server/crypto/uuid.ts`, in:

- `apps/server/src/server/location/eligibility.ts:312` (LocationCheck)
- `apps/server/src/server/discussions/posts.ts:317` (GeneralPost)
- `apps/server/src/server/directory/submissions.ts:170` and `:295`
- `apps/server/src/server/location/service-area.ts:16`
- `apps/server/src/server/directory/osm.ts:303`. This is a bulk `INSERT … SELECT`, so per-row IDs can't come from one parameter. Either add a small SQL function `uuid_v7()` in a migration (a pure-SQL version is fine) and call it here, or leave this one as is. Place imports are rare, so it matters least.

**Test:** in a test that creates a general post and a location check, assert the ID's version digit is `7`, i.e. the 15th character of the ID string (`id[14] === '7'`).

### A3. Fix the per-chat queries in `listConversations` · priority MEDIUM

`apps/server/src/server/social/messages.ts:311`: for **each** conversation it runs a `findFirst` for the last message and a `canMessage` check. With 50 chats that is 100+ queries per call, and the app polls this endpoint.

Rewrite as one raw query:

- `ConversationMember` for the user
- `JOIN` both users of the conversation
- `LEFT JOIN LATERAL` for the newest visible message. "Visible" means the same conditions as `visibleTo()`: `unsentAt IS NULL`, after `hiddenBefore`, and not in `MessageHide` for this user. Include whether that message has photos.
- Friendship status (and block status, matching whatever `canMessage` checks today), joined in the same query or loaded in one batch for all conversation partners.
- Sort by the last message time in SQL.

Keep decryption in Node, as today. Keep the existing behavior and tests in `test/messages.test.ts` green, and add a test with several chats where the order and unread flags are correct.

### A4. Let username prefix search use an index · priority MEDIUM

The database collation is `en_US.utf8`, so `"usernameNormalized" LIKE 'abc%'` (feed `@name` search in `posts.ts` `searchFilter`, and friend search in `friends.ts`) **cannot** use the existing unique B-tree index. Add a migration:

```sql
CREATE INDEX "User_usernameNormalized_prefix_idx" ON "User" ("usernameNormalized" varchar_pattern_ops);
```

Prisma 7 supports operator classes in `@@index(... ops: ...)` for Postgres. Declare it in the schema if possible so there's no drift. Otherwise document it as a raw-SQL index, as is already done for the CHECK constraints.

### A5. Make tight, purpose-built indexes · priority LOW

| Replace                               | With                                                                                              | Used by                                      |
| ------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `Notification (userId, readAt)`       | `Notification (userId) WHERE "readAt" IS NULL` (or keep it if partial indexes aren't expressible) | Unread bell count                            |
| _(add)_                               | `Notification (createdAt)`                                                                        | Daily purge                                  |
| `Comment (authorKind, createdAt)`     | `Comment (createdAt) WHERE "authorKind" = 'GUEST'` (same caveat)                                  | Guest-comment purge in `jobs/maintenance.ts` |
| `Message (conversationId, createdAt)` | `Message (conversationId, createdAt DESC, id DESC)`                                               | Chat paging (matches its `ORDER BY`)         |

### A6. Clean up rate-limit counters more often · priority MEDIUM

`RateLimitCounter` gets 1–2 inserts or updates per limited request, but expired rows are only deleted by the **daily** job.

- Move the `rateLimitCounter.deleteMany({ where: { expiresAt: { lt: now } } })` step into its own small job that runs every **10 minutes**. Use the same advisory-lock pattern as `runMaintenance`, with a different lock key. Hook it up wherever `runMaintenance` is scheduled.
- Migration: `ALTER TABLE "RateLimitCounter" SET (fillfactor = 70);`. This lets updates happen in place.
- Optional, worth doing: `ALTER TABLE "RateLimitCounter" SET UNLOGGED;`. Counters don't need to survive a crash, and writes get cheaper. Add a one-line Decision Log entry, because a crash resets all limits.

### A7. Make the maintenance job safe at large volume · priority MEDIUM

`apps/server/src/server/jobs/maintenance.ts` runs every purge in **one** transaction with a 120 s timeout, using unbatched `deleteMany`. At production volume, `LocationCheck` alone is about 250k rows a day, so this will hit the timeout and hold back vacuum. The steps that use `db` instead of `tx` (`purgeUnusedPhotos`, `purgeOldNotifications`, …) are already outside that transaction, which is inconsistent.

- Keep the advisory lock, but use a **session-level** lock (`pg_try_advisory_lock` / `pg_advisory_unlock` in `finally`) instead of a transaction-level one. Then run each purge step in its **own** short transaction.
- Delete large tables in batches until done:
  `DELETE FROM "LocationCheck" WHERE id IN (SELECT id FROM "LocationCheck" WHERE "receivedAt" < $1 LIMIT 5000)`.
  This applies to LocationCheck, Session, EmailToken and Notification.
- Keep the returned `MaintenanceReport` shape, and keep the existing tests green.

### A8. Production database settings · document only

Add a **Production database** section to the deploy notes (or `docs/`). Don't provision anything; paid services need the user's approval.

- Extensions: **only** `postgis` and `pg_trgm`. The dev Docker image also installs `postgis_tiger_geocoder`, `postgis_topology` and `fuzzystrmatch`; the app doesn't need them.
- A connection pooler in front of Postgres: PgBouncer in transaction mode, or the provider's own. Set the Prisma `pg` pool size explicitly in `apps/server/src/server/db.ts` from an env var, e.g. `DATABASE_POOL_MAX`, defaulting to 10. Add it to `.env.example` with a placeholder.
- For the app's database role: `statement_timeout = '10s'`, `idle_in_transaction_session_timeout = '30s'`.
- Enable `pg_stat_statements`.
- Run autovacuum more often on `Vote`, `Message`, `LocationCheck` and `RateLimitCounter` (e.g. `autovacuum_vacuum_scale_factor = 0.02`).

---

## Part B — Needs the user's decision first (add to Open Questions)

Write each one up as an Open Question with the recommendation shown. **Don't build it until it's answered.** Then record a Decision Log entry.

| #   | Question                                                                                                                                                                                                                                                                 | Recommendation                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | **Partition `LocationCheck`** by week on `receivedAt` and drop old partitions, instead of deleting rows? It's the largest table (~7–8M rows at steady state). This is easy now while it's empty and hard later.                                                          | **Yes, before launch.** Use native range partitioning. The primary key becomes `(id, receivedAt)`. Prisma can't model partitioned tables, so create them in raw SQL, and have the job create partitions ahead of time and drop expired ones. |
| B2  | Should **allowed** feed and room reads (`general.read`, `business.read`) still write a precise `LocationCheck` row every time? Changes D7.                                                                                                                               | Log all **denials** and all **writes** (post, comment, vote, report, message). For allowed reads, log at most one per user every 10 minutes. This cuts the table by ~80%.                                                                    |
| B3  | **Notifications retention** (changes D76, currently 90 days). The user suggested a few days.                                                                                                                                                                             | Delete **read** notifications 7 days after they're read, and **unread** ones after 30 days.                                                                                                                                                  |
| B4  | **Posts and comments their authors deleted** (`status = DELETED`) are kept forever, along with all their votes and attachments.                                                                                                                                          | Hard-delete 30 days after the author deletes. Keep `REMOVED` (by moderation) for 1 year as evidence. Never delete while a report on it is open.                                                                                              |
| B5  | **Private messages** have no retention.                                                                                                                                                                                                                                  | Keep them (normal for chat apps). Delete the rows of **unsent** messages 1 day after unsending.                                                                                                                                              |
| B6  | **Removed or rejected media** (`Photo` with status `REMOVED`/`REJECTED`): the rows, and possibly the stored files, are never deleted.                                                                                                                                    | Delete the row **and the stored file** after 30 days, unless a report on it is open.                                                                                                                                                         |
| B7  | **LocationFlag, Installation, ContactMessage** are never purged.                                                                                                                                                                                                         | Reviewed flags: delete after 1 year. Installs not seen for 1 year and not banned: delete. Resolved contact tickets: delete after 2 years.                                                                                                    |
| B8  | **AdminAuditLog / ModerationAction**: how long to keep them?                                                                                                                                                                                                             | At least 3 years; write the policy down. No job needed yet.                                                                                                                                                                                  |
| B9  | **Split the `User` table**: move admin 2FA (`totpSecretEnc`, `totpEnabledAt`, `totpLastStep`) into `AdminCredential (userId PK)`, and preferences (`generalRadiusMiles`, `businessRadiusMiles`, `profileColor`, `hidePostsFromFriends`) into `UserSettings (userId PK)`. | **Yes, before launch.** The `User` row is read on every request, and the 2FA secret gets its own table. It touches the auth, admin, profile and feed code, so do it as a separate tracker item.                                              |

**Optional, low priority** (raise only if time allows): an `AutoSuspensionHeldPost` join table to replace the `uuid[]` arrays; a `PlaceCategory` lookup table; making `score` a generated column (`upCount - downCount`).

**Leave as is (reviewed, don't change):** the GeneralPost/BusinessPost split; the one-column-per-target pattern on Vote, Report and ModerationAction (now enforced by CHECK constraints and indexed after A1); the duplicated fields in BusinessSubmission (it's a draft); `AdminAuditLog.targetId` having no foreign key (it must outlive deleted targets); the stored counter columns (maintained in the same transaction).

---

## Suggested order

1. **A1 + A4 + A5** in one migration, plus the schema-constraints test
2. **A2** (UUIDv7)
3. **A6 + A7** (maintenance job)
4. **A3** (chat list)
5. Raise **B1–B9** as Open Questions. Do **B1** and **B9** first once they're approved, because they are much easier before launch.
6. **A8** (document production settings)
7. Before launch, a **load test**: seed a scratch database with ~50k users, ~1M posts, ~20M votes and ~10M messages. Run `EXPLAIN (ANALYZE, BUFFERS)` on the feed, place room, chat list, unread badges and admin queue, and record the results in the Progress Log.
