import { beforeEach, describe, expect, it } from 'vitest';
import { POST as feedPOST } from '@/app/api/v1/feed/route';
import { GET as myMedalsGET } from '@/app/api/v1/me/medals/route';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { POST as postDetailPOST } from '@/app/api/v1/posts/[id]/route';
import { POST as commentPOST } from '@/app/api/v1/posts/[id]/comments/route';
import { PUT as votePUT } from '@/app/api/v1/posts/[id]/vote/route';
import { POST as profilePOST } from '@/app/api/v1/users/[username]/route';
import { evaluateAchievements } from '@/server/achievements';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { runMaintenance } from '@/server/jobs/maintenance';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { findForbiddenKeys } from '@/server/serializers';
import { ACHIEVEMENTS } from '../prisma/seed-data';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

const HERE = { latitude: 30.3149, longitude: -81.6853 };
const reading = () => ({ ...HERE, accuracyMeters: 10, timestamp: Date.now() - 2_000 });
const HOUR = 3_600_000;

let author: { id: string; token: string };
let fan: { id: string; token: string };

async function person(name: string) {
  const u = await createTestUser(name, { emailVerifiedAt: new Date() });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
}
const keys = async (userId: string) =>
  (await db.userAchievement.findMany({ where: { userId }, include: { achievement: true } }))
    .map((a) => a.achievement.key)
    .sort();
const post = async (token: string, body: string) =>
  (await call(postsPOST as H, 'POST', { token, body: { reading: reading(), body } })).body.post
    .id as string;

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  await db.appConfiguration.create({ data: { key: 'rateLimit.post.perMinute', value: 100 } });
  invalidateConfigCache();
  await importServiceArea(db, readBoundaryFile());
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
  author = await person('author_m');
  fan = await person('fan_m');
});

describe('First Contribution (P6.8)', () => {
  it('needs content that stayed up 24 hours, then is awarded once', async () => {
    const id = await post(author.token, 'Hello Jacksonville, first post here');
    await evaluateAchievements();
    expect(await keys(author.id)).toEqual([]); // too new
    await db.generalPost.update({
      where: { id },
      data: { createdAt: new Date(Date.now() - 25 * HOUR) },
    });
    expect((await runMaintenance())?.achievementsAwarded).toBe(1);
    expect(await keys(author.id)).toEqual(['first_contribution']);
    expect((await runMaintenance())?.achievementsAwarded).toBe(0); // idempotent
  });

  it('removed content doesn’t count, and banned users don’t earn medals', async () => {
    const id = await post(author.token, 'This one gets removed later on');
    await db.generalPost.update({
      where: { id },
      data: { createdAt: new Date(Date.now() - 25 * HOUR), status: 'REMOVED' },
    });
    const ok = await post(fan.token, 'A post that stays up the whole time');
    await db.generalPost.update({
      where: { id: ok },
      data: { createdAt: new Date(Date.now() - 25 * HOUR) },
    });
    await db.user.update({ where: { id: fan.id }, data: { status: 'BANNED' } });
    await evaluateAchievements();
    expect(await keys(author.id)).toEqual([]);
    expect(await keys(fan.id)).toEqual([]);
  });
});

describe('Well Received (P6.8: quality, not volume)', () => {
  it('needs 5 different posts each at +3; awarded on the upvote that completes it', async () => {
    const ids = [];
    for (let i = 0; i < 5; i++)
      ids.push(await post(author.token, `Useful local tip number ${i} for all`));
    // Four posts already well liked, the fifth at +2.
    for (const id of ids.slice(0, 4))
      await db.generalPost.update({ where: { id }, data: { score: 3 } });
    await db.generalPost.update({ where: { id: ids[4] }, data: { score: 2 } });
    await evaluateAchievements();
    expect(await keys(author.id)).toEqual([]);
    const v = await call(votePUT as H, 'PUT', {
      token: fan.token,
      id: ids[4],
      body: { reading: reading(), value: 1 },
    });
    expect(v.body.score).toBe(3);
    expect(await keys(author.id)).toEqual(['well_received']);
  });

  it('one very popular post isn’t enough', async () => {
    const id = await post(author.token, 'One viral post about the Jaguars');
    await db.generalPost.update({ where: { id }, data: { score: 500 } });
    await evaluateAchievements();
    expect(await keys(author.id)).toEqual([]);
  });
});

describe('medals shown (P6.9)', () => {
  it('next to the name on posts and comments, and on the profile', async () => {
    const award = await db.achievement.findUniqueOrThrow({
      where: { key: 'approved_contributor' },
    });
    await db.userAchievement.create({ data: { userId: author.id, achievementId: award.id } });
    const id = await post(author.token, 'A post from someone with a medal');
    await call(commentPOST as H, 'POST', {
      token: author.token,
      id,
      body: { reading: reading(), body: 'And a comment too' },
    });
    const feed = await call(feedPOST as H, 'POST', {
      token: fan.token,
      body: { reading: reading() },
    });
    expect(feed.body.posts[0].author).toMatchObject({
      username: 'author_m',
      medals: ['approved_contributor'],
    });
    const detail = await call(postDetailPOST as H, 'POST', {
      token: fan.token,
      id,
      body: { reading: reading() },
    });
    expect(detail.body.comments[0].author.medals).toEqual(['approved_contributor']);
    const prof = await call(profilePOST as H, 'POST', {
      token: fan.token,
      params: { username: 'author_m' },
      body: { reading: reading() },
    });
    expect(prof.body.profile.medals).toEqual([
      expect.objectContaining({ key: 'approved_contributor', name: 'Approved Contributor' }),
    ]);
    expect(findForbiddenKeys(prof.body)).toEqual([]);
    const mine = await call(myMedalsGET as H, 'GET', { token: author.token });
    expect(mine.body.medals.map((m: { key: string }) => m.key)).toEqual(['approved_contributor']);
  });

  it('turning an achievement off hides it everywhere', async () => {
    const award = await db.achievement.findUniqueOrThrow({
      where: { key: 'approved_contributor' },
    });
    await db.userAchievement.create({ data: { userId: author.id, achievementId: award.id } });
    await db.achievement.update({ where: { id: award.id }, data: { active: false } });
    await post(author.token, 'Post after the medal was retired');
    const feed = await call(feedPOST as H, 'POST', {
      token: fan.token,
      body: { reading: reading() },
    });
    expect(feed.body.posts[0].author.medals).toEqual([]);
  });
});
