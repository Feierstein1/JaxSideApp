import { beforeEach, describe, expect, it } from 'vitest';
import { DELETE as topicDELETE } from '@/app/api/v1/topics/[id]/route';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { POST as pagePOST } from '@/app/api/v1/topics/list/route';
import { POST as createPOST } from '@/app/api/v1/topics/route';
import { listCases } from '@/server/admin/queue';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { invalidateScreeningCache } from '@/server/moderation/screening';
import { STARTER_SCREENING_RULES } from '../prisma/seed-data';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D143: one new topic of each kind per 30 days. D142: spam and scam phrases hold a topic.
const DAY = 86_400_000;
const AT = { latitude: 30.3274, longitude: -81.6588 };
const reading = () => ({ ...AT, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

async function person(name: string, role: 'USER' | 'ADMIN' = 'USER', ageDays = 10) {
  const u = await createTestUser(name, {
    role,
    emailVerifiedAt: new Date(),
    createdAt: new Date(Date.now() - ageDays * DAY),
  });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
}
const create = (token: string, scope: 'city' | 'local', title: string, description?: string) =>
  call(createPOST as H, 'POST', {
    token,
    body: { reading: reading(), scope, title, ...(description ? { description } : {}) },
  });
const listed = async (token: string) =>
  (
    (await call(pagePOST as H, 'POST', { token, body: { reading: reading(), scope: 'city' } })).body
      .topics as { title: string }[]
  ).map((t) => t.title);

let me: { id: string; token: string };
beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  await importServiceArea(db, readBoundaryFile());
  invalidateConfigCache();
  invalidateScreeningCache();
  me = await person('tl_me');
}, 60_000);

describe('one topic of each kind per 30 days (D143)', () => {
  // 🔒 A second topic of the same kind is refused, even after deleting the first.
  it('allows one City and one Near me topic, then refuses until 30 days have passed', async () => {
    const city = await create(me.token, 'city', 'First city topic');
    expect(city.status).toBe(201);
    expect((await create(me.token, 'local', 'First local topic')).status).toBe(201);

    const again = await create(me.token, 'city', 'Second city topic');
    expect(again.status).toBe(429);
    expect(again.body.error.code).toBe('TOPIC_LIMIT');
    expect(again.body.error.message).toMatch(/one City topic every 30 days/);

    // Deleting the topic doesn't give the slot back.
    await call(topicDELETE as H, 'DELETE', { token: me.token, id: city.body.topic.id });
    expect((await create(me.token, 'city', 'Third city topic')).status).toBe(429);

    // 31 days later it's allowed again.
    await db.cityTopic.updateMany({
      where: { createdById: me.id },
      data: { createdAt: new Date(Date.now() - 31 * DAY) },
    });
    expect((await create(me.token, 'city', 'A month later')).status).toBe(201);
  });

  it("doesn't limit admins", async () => {
    const admin = await person('tl_admin', 'ADMIN');
    expect((await create(admin.token, 'city', 'Admin topic one')).status).toBe(201);
    expect((await create(admin.token, 'city', 'Admin topic two')).status).toBe(201);
  });
});

describe('new accounts wait 5 days to start a topic (D147)', () => {
  // 🔒 A 3-day-old account can't start one, but can post in an existing topic.
  it('refuses starting a topic until the account is 5 days old; posting in one works', async () => {
    const fresh = await person('tl_fresh', 'USER', 3);
    const r = await create(fresh.token, 'city', 'Visit my new shop');
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('ACCOUNT_TOO_NEW');
    expect(r.body.error.message).toMatch(/after 5 days/);

    const t = (await create(me.token, 'city', 'Existing topic')).body.topic;
    const post = await call(postsPOST as H, 'POST', {
      token: fresh.token,
      body: { reading: reading(), body: 'Joining in here', topicId: t.id },
    });
    expect(post.status).toBe(201);

    await db.user.update({
      where: { id: fresh.id },
      data: { createdAt: new Date(Date.now() - 6 * DAY) },
    });
    expect((await create(fresh.token, 'city', 'Now I can start one')).status).toBe(201);
  });
});

describe('spam and scam topics are held for review (D142)', () => {
  beforeEach(async () => {
    await db.screeningRule.createMany({
      data: STARTER_SCREENING_RULES.map((r) => ({ ...r, match: 'WORD' as const })),
    });
    invalidateScreeningCache();
  });

  it('saves the topic hidden, tells the creator, and puts it in the queue', async () => {
    const r = await create(
      me.token,
      'city',
      'Crypto giveaway for Jacksonville',
      'Send BTC and get double back!',
    );
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ held: true });
    const t = await db.cityTopic.findFirstOrThrow({ where: { createdById: me.id } });
    expect(t.status).toBe('HELD');
    const other = await person('tl_other');
    expect(await listed(other.token)).toEqual([]);
    expect((await listCases()).rows).toEqual([
      expect.objectContaining({ type: 'topic', id: t.id, contentStatus: 'HELD_FOR_REVIEW' }),
    ]);
    // A held topic still counts toward the monthly limit.
    expect((await create(me.token, 'city', 'Something normal')).status).toBe(429);
  });

  it('leaves ordinary topics alone', async () => {
    expect((await create(me.token, 'city', 'Best gift for a dad who fishes?')).status).toBe(201);
  });
});
