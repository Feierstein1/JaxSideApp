import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@/server/db';
import { resetDb } from './db-helpers';

// Downtown Jacksonville, used only as fixture coordinates.
const LNG = -81.6557;
const LAT = 30.3322;

async function makeUser(name: string) {
  return db.user.create({
    data: {
      username: name,
      usernameNormalized: name.toLowerCase(),
      email: `${randomUUID()}@example.test`,
      passwordHash: 'x',
      birthYear: 1990,
      tosAcceptedAt: new Date(),
      tosVersion: 'test',
      adultConfirmedAt: new Date(),
    },
  });
}

async function makeGeneralPost(authorId: string): Promise<string> {
  const id = randomUUID();
  await db.$executeRaw`
    INSERT INTO "GeneralPost" (id, "authorId", body, location, "updatedAt")
    VALUES (${id}::uuid, ${authorId}::uuid, 'hello',
            ST_SetSRID(ST_MakePoint(${LNG}, ${LAT}), 4326)::geography, now())`;
  return id;
}

async function makeGuest() {
  const inst = await db.installation.create({ data: {} });
  return db.guestSession.create({
    data: {
      tokenHash: 'g'.repeat(64),
      installationId: inst.id,
      expiresAt: new Date(Date.now() + 86_400_000),
    },
  });
}

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
