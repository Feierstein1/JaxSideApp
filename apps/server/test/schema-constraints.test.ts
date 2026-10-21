import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { resetDb } from './db-helpers';
import { createTestGuest, createTestUser } from './user-factory';

// Downtown Jacksonville, used only as fixture coordinates.
const LNG = -81.6557;
const LAT = 30.3322;

const makeUser = (name: string) => createTestUser(name);

async function makeGeneralPost(authorId: string): Promise<string> {
  const id = randomUUID();
  await db.$executeRaw`
    INSERT INTO "GeneralPost" (id, "authorId", body, location, "updatedAt")
    VALUES (${id}::uuid, ${authorId}::uuid, 'hello',
            ST_SetSRID(ST_MakePoint(${LNG}, ${LAT}), 4326)::geography, now())`;
  return id;
}

const makeGuest = () => createTestGuest();

/** Asserts the promise fails with a Postgres constraint error (CHECK or UNIQUE). */
async function expectConstraintViolation(p: Promise<unknown>, constraint?: string) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, 'expected a constraint violation').not.toBeNull();
  if (constraint)
    expect(String((err as Error).message) + JSON.stringify(err)).toContain(constraint);
}

beforeEach(resetDb);

describe('database constraints (D5, D6)', () => {
  it('extensions are installed', async () => {
    const rows = await db.$queryRaw<{ extname: string }[]>`SELECT extname FROM pg_extension`;
    const names = rows.map((r) => r.extname);
    expect(names).toEqual(expect.arrayContaining(['postgis', 'pg_trgm']));
  });

  it('GeneralPost requires a location', async () => {
    const u = await makeUser('poster');
    await expectConstraintViolation(
      db.$executeRaw`INSERT INTO "GeneralPost" (id, "authorId", body, "updatedAt")
                     VALUES (${randomUUID()}::uuid, ${u.id}::uuid, 'x', now())`,
      'GeneralPost_location_required',
    );
  });

  describe('Vote', () => {
    it('allows one vote per (voter, target) and rejects a second of either direction', async () => {
      const u = await makeUser('voter');
      const postId = await makeGeneralPost(u.id);
      await db.vote.create({ data: { voterId: u.id, generalPostId: postId, value: 1 } });
      await expectConstraintViolation(
        db.vote.create({ data: { voterId: u.id, generalPostId: postId, value: 1 } }),
      );
      await expectConstraintViolation(
        db.vote.create({ data: { voterId: u.id, generalPostId: postId, value: -1 } }),
      );
    });

    it('rejects values other than +1/-1', async () => {
      const u = await makeUser('voter2');
      const postId = await makeGeneralPost(u.id);
      await expectConstraintViolation(
        db.vote.create({ data: { voterId: u.id, generalPostId: postId, value: 5 } }),
        'Vote_value',
      );
    });

    it('rejects a vote with zero or two targets', async () => {
      const u = await makeUser('voter3');
      const postId = await makeGeneralPost(u.id);
      await expectConstraintViolation(
        db.vote.create({ data: { voterId: u.id, value: 1 } }),
        'Vote_one_target',
      );
      const c = await db.comment.create({
        data: { generalPostId: postId, authorKind: 'USER', authorUserId: u.id, body: 'c' },
      });
      await expectConstraintViolation(
        db.vote.create({
          data: { voterId: u.id, generalPostId: postId, commentId: c.id, value: 1 },
        }),
        'Vote_one_target',
      );
    });
  });

  describe('Comment', () => {
    it('must belong to exactly one post', async () => {
      const u = await makeUser('commenter');
      await expectConstraintViolation(
        db.comment.create({ data: { authorKind: 'USER', authorUserId: u.id, body: 'x' } }),
        'Comment_one_post',
      );
    });

    it('authorKind must match the author columns', async () => {
      const u = await makeUser('commenter2');
      const guest = await makeGuest();
      const postId = await makeGeneralPost(u.id);
      // USER kind with a guest author
      await expectConstraintViolation(
        db.comment.create({
          data: { generalPostId: postId, authorKind: 'USER', authorGuestId: guest.id, body: 'x' },
        }),
        'Comment_author_kind',
      );
      // GUEST kind claiming a user author
      await expectConstraintViolation(
        db.comment.create({
          data: { generalPostId: postId, authorKind: 'GUEST', authorUserId: u.id, body: 'x' },
        }),
        'Comment_author_kind',
      );
    });

    it('keeps the GUEST label after guest session data is purged (§16)', async () => {
      const u = await makeUser('host');
      const guest = await makeGuest();
      const postId = await makeGeneralPost(u.id);
      const c = await db.comment.create({
        data: { generalPostId: postId, authorKind: 'GUEST', authorGuestId: guest.id, body: 'hi' },
      });
      await db.guestSession.delete({ where: { id: guest.id } });
      const after = await db.comment.findUniqueOrThrow({ where: { id: c.id } });
      expect(after.authorKind).toBe('GUEST');
      expect(after.authorGuestId).toBeNull();
    });
  });

  it('FavoritePlace is unique per (user, place)', async () => {
    const u = await makeUser('fav');
    const placeId = randomUUID();
    await db.$executeRaw`
      INSERT INTO "BusinessPlace" (id, name, "nameNormalized", category, latitude, longitude, location,
                                   "sourceName", "sourceId", "updatedAt")
      VALUES (${placeId}::uuid, 'Cafe', 'cafe', 'cafe', ${LAT}, ${LNG},
              ST_SetSRID(ST_MakePoint(${LNG}, ${LAT}), 4326)::geography, 'test', '1', now())`;
    await db.favoritePlace.create({ data: { userId: u.id, placeId } });
    await expectConstraintViolation(db.favoritePlace.create({ data: { userId: u.id, placeId } }));
  });

  it('UserBlock rejects self-blocks', async () => {
    const u = await makeUser('blocker');
    await expectConstraintViolation(
      db.userBlock.create({ data: { blockerId: u.id, blockedId: u.id } }),
      'UserBlock_not_self',
    );
  });

  it('Report must target exactly one thing', async () => {
    const u = await makeUser('reporter');
    await expectConstraintViolation(
      db.report.create({ data: { reporterUserId: u.id, reason: 'SPAM' } }),
      'Report_one_target',
    );
  });

  it('usernames are unique case-insensitively via usernameNormalized', async () => {
    await makeUser('RiverRat');
    await expectConstraintViolation(makeUser('riverrat'), 'usernameNormalized');
  });
});

describe('uuid_v7() (P13.2)', () => {
  it('makes version-7 IDs that start with the current time and sort by creation', async () => {
    const before = Date.now();
    const rows = await db.$queryRaw<{ id: string }[]>`
      SELECT uuid_v7()::text AS id FROM generate_series(1, 3)`;
    const after = Date.now();
    for (const { id } of rows) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
      const ms = parseInt(id.replace(/-/g, '').slice(0, 12), 16);
      expect(ms).toBeGreaterThanOrEqual(before - 1000); // clocks may differ slightly
      expect(ms).toBeLessThanOrEqual(after + 1000);
    }
    expect(new Set(rows.map((r) => r.id)).size).toBe(3);
    // A later one sorts after an earlier one (millisecond resolution).
    const [a] = await db.$queryRaw<{ id: string }[]>`SELECT uuid_v7()::text AS id`;
    await new Promise((r) => setTimeout(r, 5));
    const [b] = await db.$queryRaw<{ id: string }[]>`SELECT uuid_v7()::text AS id`;
    expect(a!.id < b!.id).toBe(true);
  });
});

describe('indexes (P13.1, DB review A1 / A4)', () => {
  /** Foreign keys that may stay unindexed on purpose (none today). */
  const ALLOWED: string[] = [];

  // Postgres doesn't index foreign keys itself; without one, deleting the parent row reads the
  // whole child table. Any new unindexed foreign key fails here.
  it('every foreign key has an index that starts with its columns', async () => {
    const rows = await db.$queryRaw<{ tbl: string; cols: string }[]>`
      SELECT c.conrelid::regclass::text AS tbl, string_agg(a.attname, ',') AS cols
      FROM pg_constraint c
      CROSS JOIN LATERAL unnest(c.conkey) x(attnum)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = x.attnum
      WHERE c.contype = 'f' AND NOT EXISTS (
        SELECT 1 FROM pg_index i WHERE i.indrelid = c.conrelid
          AND (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
          AND (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] <@ c.conkey)
      GROUP BY c.conrelid, c.conname`;
    expect(rows.map((r) => `${r.tbl}.${r.cols}`).filter((k) => !ALLOWED.includes(k))).toEqual([]);
  });

  it('"@name" prefix search can use the username index (byte-order collation)', async () => {
    const [col] = await db.$queryRaw<{ collation_name: string }[]>`
      SELECT collation_name FROM information_schema.columns
      WHERE table_name = 'User' AND column_name = 'usernameNormalized'`;
    expect(col!.collation_name).toBe('C');
    const plan = await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL enable_seqscan = off');
      return tx.$queryRawUnsafe<{ 'QUERY PLAN': string }[]>(
        `EXPLAIN SELECT id FROM "User" WHERE "usernameNormalized" LIKE 'riv%'`,
      );
    });
    expect(plan.map((r) => r['QUERY PLAN']).join('\n')).toContain('User_usernameNormalized_key');
  });

  it('the "one open …" rules are still unique indexes', async () => {
    const rows = await db.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes
      WHERE indexname IN ('Appeal_one_open_per_action', 'PlaceRemoval_one_open_per_place', 'OwnerClaim_one_open')`;
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r.indexdef).toMatch(/^CREATE UNIQUE INDEX .* WHERE /);
  });
});
