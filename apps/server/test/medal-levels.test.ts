import { beforeEach, describe, expect, it } from 'vitest';
import { evaluateAchievements, evaluateForCommentAuthor, medalsFor } from '@/server/achievements';
import { db } from '@/server/db';
import { importZipAreas } from '@/server/stats/zip-areas';
import { ACHIEVEMENTS } from '../prisma/seed-data';
import { resetDb } from './db-helpers';
import { createTestUser } from './user-factory';

// D122: medal levels (Bronze → Platinum) and the four new medals.
const DAY = 86_400_000;
let me: string;
let other: string;

beforeEach(async () => {
  await resetDb();
  for (const a of ACHIEVEMENTS) {
    await db.achievement.create({
      data: {
        key: a.key,
        name: a.name,
        description: a.description,
        icon: a.icon,
        criteria: a.criteria,
      },
    });
  }
  me = (await createTestUser('medal_me')).id;
  other = (await createTestUser('medal_other')).id;
});

const tierOf = async (key: string) =>
  (
    await db.userAchievement.findFirst({
      where: { userId: me, achievement: { key } },
      select: { tier: true },
    })
  )?.tier ?? 0;

const DOWNTOWN = { lat: 30.3274, lon: -81.6588 };

/** One visible post (posts always have a location). */
async function newPost(
  authorId: string,
  score = 0,
  at = DOWNTOWN,
  createdAt = new Date(),
): Promise<string> {
  const [row] = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO "GeneralPost" (id, "authorId", body, score, location, "createdAt", "updatedAt")
    VALUES (uuid_v7(), ${authorId}::uuid, 'a post', ${score},
            ST_SetSRID(ST_MakePoint(${at.lon}, ${at.lat}), 4326)::geography, ${createdAt}, now())
    RETURNING id`;
  return row!.id;
}

/** `n` visible posts by me, each at `score`, optionally at a point. */
async function posts(n: number, score: number, at = DOWNTOWN) {
  const ids: string[] = [];
  for (let i = 0; i < n; i++) ids.push(await newPost(me, score, at));
  return ids;
}

describe('levels', () => {
  it('Well Received climbs Bronze → Silver → Gold → Platinum at 5 / 25 / 100 / 250 posts', async () => {
    await posts(4, 3);
    await evaluateAchievements(new Date(), me);
    expect(await tierOf('well_received')).toBe(0);
    await posts(1, 3);
    expect(await evaluateAchievements(new Date(), me)).toBeGreaterThanOrEqual(1);
    expect(await tierOf('well_received')).toBe(1);
    await posts(20, 5);
    await evaluateAchievements(new Date(), me);
    expect(await tierOf('well_received')).toBe(2);
    await posts(225, 3);
    await evaluateAchievements(new Date(), me);
    expect(await tierOf('well_received')).toBe(4); // 250: Platinum, the top
    const [m] = (await medalsFor(me)).filter((x) => x.key === 'well_received');
    expect(m).toMatchObject({ tier: 4, tierName: 'Platinum', levels: 4, next: null });
  });

  it('a level is never taken away, and re-running changes nothing', async () => {
    const ids = await posts(25, 3);
    await evaluateAchievements(new Date(), me);
    expect(await tierOf('well_received')).toBe(2);
    await db.generalPost.updateMany({ where: { id: { in: ids } }, data: { score: 0 } });
    expect(await evaluateAchievements(new Date(), me)).toBe(0);
    expect(await tierOf('well_received')).toBe(2);
  });

  it('Silver records when it was reached; the profile says what the next level takes', async () => {
    await posts(25, 3);
    const when = new Date('2026-10-24T12:00:00Z');
    await evaluateAchievements(when, me);
    const [m] = (await medalsFor(me)).filter((x) => x.key === 'well_received');
    expect(m).toMatchObject({
      tier: 2,
      tierName: 'Silver',
      next: { tierName: 'Gold', needs: '100 posts' },
      tierAt: when.toISOString(),
    });
  });

  it('a one-level medal (First Contribution) stays Bronze with no next level', async () => {
    await newPost(me, 0, DOWNTOWN, new Date(Date.now() - 2 * DAY));
    await evaluateAchievements(new Date(), me);
    const [m] = (await medalsFor(me)).filter((x) => x.key === 'first_contribution');
    expect(m).toMatchObject({ tier: 1, tierName: 'Bronze', levels: 1, next: null });
  });

  it('the database refuses a level outside 1–4', async () => {
    const def = await db.achievement.findUniqueOrThrow({ where: { key: 'well_received' } });
    await expect(
      db.userAchievement.create({ data: { userId: me, achievementId: def.id, tier: 5 } }),
    ).rejects.toThrow();
  });
});

describe('Helpful Commenter', () => {
  async function comment(score: number, onPost?: string) {
    const postId = onPost ?? (await newPost(other));
    return db.comment.create({
      data: {
        generalPostId: postId,
        authorKind: 'USER',
        authorUserId: me,
        body: 'good point',
        score,
      },
    });
  }

  it('5 comments at +3 on different posts earn Bronze (checked after a comment upvote)', async () => {
    for (let i = 0; i < 4; i++) await comment(3);
    const last = await comment(3);
    await evaluateForCommentAuthor(last.id);
    expect(await tierOf('helpful_commenter')).toBe(1);
  });

  it('many good comments under one post count once', async () => {
    const p = await newPost(other);
    for (let i = 0; i < 6; i++) await comment(5, p);
    await evaluateAchievements(new Date(), me);
    expect(await tierOf('helpful_commenter')).toBe(0);
  });
});

describe('Place Verifier', () => {
  async function submission(status: 'APPROVED' | 'REJECTED' | 'PENDING') {
    const [row] = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO "BusinessSubmission"
        (id, "submitterId", name, "nameNormalized", category, latitude, longitude, location,
         status, "updatedAt")
      VALUES (uuid_v7(), ${other}::uuid, 'Spot', 'spot', 'cafe', 30.32, -81.66,
              ST_SetSRID(ST_MakePoint(-81.66, 30.32), 4326)::geography,
              ${status}::"SubmissionStatus", now())
      RETURNING id`;
    return row!;
  }

  it('counts only votes that matched the final result', async () => {
    for (let i = 0; i < 3; i++) {
      const s = await submission('APPROVED');
      await db.placeChangeVote.create({
        data: { voterId: me, submissionId: s.id, support: true, distanceMeters: 50 },
      });
    }
    for (let i = 0; i < 2; i++) {
      const s = await submission('REJECTED');
      await db.placeChangeVote.create({
        data: { voterId: me, submissionId: s.id, support: false, distanceMeters: 50 },
      });
    }
    // Wrong calls and undecided ones don't count.
    const wrong = await submission('APPROVED');
    await db.placeChangeVote.create({
      data: { voterId: me, submissionId: wrong.id, support: false, distanceMeters: 50 },
    });
    const open = await submission('PENDING');
    await db.placeChangeVote.create({
      data: { voterId: me, submissionId: open.id, support: true, distanceMeters: 50 },
    });
    await evaluateAchievements(new Date(), me);
    expect(await tierOf('place_verifier')).toBe(1); // exactly 5 matched
  });
});

describe('Neighborhood Explorer', () => {
  it('counts different ZIP areas with a post at +3, not the number of posts', async () => {
    await importZipAreas(db);
    const spots = await db.$queryRaw<{ lat: number; lon: number }[]>`
      SELECT ST_Y(ST_PointOnSurface(geom::geometry)) AS lat,
             ST_X(ST_PointOnSurface(geom::geometry)) AS lon
      FROM "ZipArea" ORDER BY zip LIMIT 3`;
    expect(spots).toHaveLength(3);
    await posts(5, 3, spots[0]); // five in one area
    await posts(1, 3, spots[1]);
    await evaluateAchievements(new Date(), me);
    expect(await tierOf('neighborhood_explorer')).toBe(0); // two areas
    await posts(1, 1, spots[2]); // a third area, but not at +3
    await evaluateAchievements(new Date(), me);
    expect(await tierOf('neighborhood_explorer')).toBe(0);
    await posts(1, 3, spots[2]);
    await evaluateAchievements(new Date(), me);
    expect(await tierOf('neighborhood_explorer')).toBe(1);
  });
});

describe('Longtime Neighbor', () => {
  const ago = (days: number) => new Date(Date.now() - days * DAY);

  it('3 months in good standing is Bronze; 1 year is Gold', async () => {
    await db.user.update({ where: { id: me }, data: { createdAt: ago(100) } });
    await evaluateAchievements(new Date(), me);
    expect(await tierOf('longtime_neighbor')).toBe(1);
    await db.user.update({ where: { id: me }, data: { createdAt: ago(400) } });
    await evaluateAchievements(new Date(), me);
    expect(await tierOf('longtime_neighbor')).toBe(3);
  });

  it('a suspension in the last 90 days holds it back; a warning does not', async () => {
    const admin = (await createTestUser('medal_admin', { role: 'ADMIN' })).id;
    await db.user.update({ where: { id: me }, data: { createdAt: ago(200) } });
    await db.moderationAction.create({
      data: { adminId: admin, action: 'WARN', reason: 'tone', targetUserId: me },
    });
    await db.moderationAction.create({
      data: {
        adminId: admin,
        action: 'SUSPEND',
        reason: 'spam',
        targetUserId: me,
        createdAt: ago(30),
      },
    });
    await evaluateAchievements(new Date(), me);
    expect(await tierOf('longtime_neighbor')).toBe(0);
    await db.moderationAction.updateMany({
      where: { targetUserId: me, action: 'SUSPEND' },
      data: { createdAt: ago(120) },
    });
    await evaluateAchievements(new Date(), me);
    expect(await tierOf('longtime_neighbor')).toBe(2); // 200 days: Silver
  });

  it('banned or suspended accounts earn nothing', async () => {
    await db.user.update({ where: { id: me }, data: { createdAt: ago(400), status: 'BANNED' } });
    await evaluateAchievements(new Date(), me);
    expect(await tierOf('longtime_neighbor')).toBe(0);
  });
});
