import { beforeEach, describe, expect, it } from 'vitest';
import { POST as caseDecidePOST } from '@/app/api/v1/admin/cases/[type]/[id]/route';
import { POST as suggestionDecidePOST } from '@/app/api/v1/admin/poll-suggestions/[id]/route';
import { GET as pollsGET } from '@/app/api/v1/polls/route';
import { POST as pollSuggestPOST } from '@/app/api/v1/polls/suggestions/route';
import { POST as votePOST } from '@/app/api/v1/polls/[id]/vote/route';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { POST as reportPOST } from '@/app/api/v1/reports/route';
import { DELETE as unfollowDELETE, PUT as followPUT } from '@/app/api/v1/topics/[id]/follow/route';
import { POST as topicListPOST } from '@/app/api/v1/topics/[id]/posts/list/route';
import { POST as pagePOST } from '@/app/api/v1/topics/list/route';
import { POST as createPOST } from '@/app/api/v1/topics/route';
import { listCases } from '@/server/admin/queue';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { invalidateScreeningCache } from '@/server/moderation/screening';
import { findForbiddenKeys } from '@/server/serializers';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D133: City Topics redesign: city and local topics, following, topic reports, live poll
// results, poll suggestions.
const DAY = 86_400_000;
const DOWNTOWN = { latitude: 30.3274, longitude: -81.6588 };
const NEAR = { latitude: 30.3302, longitude: -81.6588 }; // ~310 m north: within half a mile
const MAYPORT = { latitude: 30.3919, longitude: -81.4307 }; // ~14 mi away, still in Duval
const reading = (at = DOWNTOWN) => ({ ...at, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

let me: { id: string; token: string };
let near: { id: string; token: string };
let far: { id: string; token: string };

async function person(name: string, verified = true) {
  const u = await createTestUser(name, {
    emailVerifiedAt: verified ? new Date() : null,
    createdAt: new Date(Date.now() - 10 * DAY),
  });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
}

const create = (token: string, body: Record<string, unknown>, at = DOWNTOWN) =>
  call(createPOST as H, 'POST', { token, body: { reading: reading(at), ...body } });
const page = (token: string, body: Record<string, unknown>, at = DOWNTOWN) =>
  call(pagePOST as H, 'POST', { token, body: { reading: reading(at), ...body } });
const titles = (r: { body: { topics: { title: string }[] } }) => r.body.topics.map((t) => t.title);

beforeEach(async () => {
  await resetDb();
  // D222: these tests are about topics that appear at once; approval has its own file.
  await db.appConfiguration.create({ data: { key: 'topics.requireApproval', value: 0 } });
  invalidateConfigCache();
  await relaxBurstLimits();
  await importServiceArea(db, readBoundaryFile());
  invalidateConfigCache();
  invalidateScreeningCache();
  me = await person('ct_me');
  near = await person('ct_near');
  far = await person('ct_far');
}, 60_000);

describe('creating topics', () => {
  it('a city topic: anyone in Duval sees it; it’s yours', async () => {
    const r = await create(me.token, {
      scope: 'city',
      title: 'Best sunsets in Jax',
      category: 'food_fun',
    });
    expect(r.status).toBe(201);
    expect(r.body.topic).toMatchObject({
      scope: 'city',
      title: 'Best sunsets in Jax',
      category: 'food_fun',
      isMine: true,
      followerCount: 0,
      postCount: 0,
    });
    expect(findForbiddenKeys(r.body)).toEqual([]);
    expect(titles(await page(far.token, { scope: 'city' }, MAYPORT))).toEqual([
      'Best sunsets in Jax',
    ]);
  });

  it('a local topic: seen and joined only within half a mile of where it was made', async () => {
    const t = (await create(me.token, { scope: 'local', title: 'Water main on Main St' })).body
      .topic;
    expect(t.scope).toBe('local');
    expect(titles(await page(near.token, { scope: 'local' }, NEAR))).toEqual([
      'Water main on Main St',
    ]);
    expect(titles(await page(far.token, { scope: 'local' }, MAYPORT))).toEqual([]);
    // Not listed as a city topic either.
    expect(titles(await page(near.token, { scope: 'city' }, NEAR))).toEqual([]);

    // Posting and reading its posts: nearby yes, across town no.
    const post = (u: typeof me, at: typeof DOWNTOWN) =>
      call(postsPOST as H, 'POST', {
        token: u.token,
        body: { reading: reading(at), body: 'Road is closed', topicId: t.id },
      });
    expect((await post(near, NEAR)).status).toBe(201);
    const tooFar = await post(far, MAYPORT);
    expect(tooFar.status).toBe(403);
    expect(tooFar.body.error.code).toBe('LOCATION_TOO_FAR');
    const readFar = await call(topicListPOST as H, 'POST', {
      token: far.token,
      id: t.id,
      body: { reading: reading(MAYPORT) },
    });
    expect(readFar.body.error.code).toBe('LOCATION_TOO_FAR');
  });

  it('is screened like posts, needs a confirmed account, and is limited per day', async () => {
    await db.screeningRule.create({
      data: { term: 'badword', action: 'BLOCK', category: 'OTHER' },
    });
    invalidateScreeningCache();
    const blocked = await create(me.token, { scope: 'city', title: 'This has badword in it' });
    expect(blocked.body.error.code).toBe('CONTENT_BLOCKED');

    const unconfirmed = await person('ct_unconf', false);
    expect((await create(unconfirmed.token, { scope: 'city', title: 'Hello there' })).status).toBe(
      403,
    );

    await db.appConfiguration.createMany({
      data: [
        { key: 'rateLimit.topicCreate.perDay', value: 2 },
        { key: 'topics.newEveryDays', value: 0 }, // the monthly limit has its own tests
      ],
    });
    invalidateConfigCache();
    expect((await create(near.token, { scope: 'city', title: 'Topic one' })).status).toBe(201);
    expect((await create(near.token, { scope: 'city', title: 'Topic two' })).status).toBe(201);
    expect((await create(near.token, { scope: 'city', title: 'Topic three' })).status).toBe(429);
  });
});

describe('the topic list', () => {
  it('searches, filters by category, sorts newest or oldest, pages 20 at a time', async () => {
    for (let i = 0; i < 22; i++) {
      await db.cityTopic.create({
        data: {
          title: `Topic number ${String(i).padStart(2, '0')}`,
          category: i % 2 ? 'sports' : 'community',
          createdAt: new Date(Date.now() - (22 - i) * 60_000),
        },
      });
    }
    const first = await page(me.token, { scope: 'city' });
    expect(first.body.topics).toHaveLength(20);
    expect(first.body.topics[0].title).toBe('Topic number 21'); // newest first
    const second = await page(me.token, { scope: 'city', cursor: first.body.nextCursor });
    expect(titles(second)).toEqual(['Topic number 01', 'Topic number 00']);
    expect(second.body.nextCursor).toBeNull();

    const oldest = await page(me.token, { scope: 'city', sort: 'oldest', limit: 2 });
    expect(titles(oldest)).toEqual(['Topic number 00', 'Topic number 01']);
    expect((await page(me.token, { scope: 'city', category: 'sports' })).body.topics).toHaveLength(
      11,
    );
    expect(titles(await page(me.token, { scope: 'city', q: 'number 07' }))).toEqual([
      'Topic number 07',
    ]);
  });
});

describe('following', () => {
  it('follow and unfollow; counts; the Following filter', async () => {
    const a = await db.cityTopic.create({ data: { title: 'Jags game day' } });
    await db.cityTopic.create({ data: { title: 'Library hours' } });
    const f = await call(followPUT as H, 'PUT', { token: me.token, id: a.id });
    expect(f.body).toEqual({ following: true, followerCount: 1 });
    await call(followPUT as H, 'PUT', { token: me.token, id: a.id }); // again: no change
    await call(followPUT as H, 'PUT', { token: near.token, id: a.id });
    const list = await page(me.token, { scope: 'city', following: true });
    expect(list.body.topics).toEqual([
      expect.objectContaining({ title: 'Jags game day', following: true, followerCount: 2 }),
    ]);
    const u = await call(unfollowDELETE as H, 'DELETE', { token: me.token, id: a.id });
    expect(u.body).toEqual({ following: false, followerCount: 1 });
    expect((await page(me.token, { scope: 'city', following: true })).body.topics).toEqual([]);
  });
});

describe('reporting a topic', () => {
  it('opens a case; removing hides it everywhere; restoring brings it back', async () => {
    const t = (await create(me.token, { scope: 'city', title: 'Rude topic title here' })).body
      .topic;
    const rep = await call(reportPOST as H, 'POST', {
      token: far.token,
      body: {
        reading: reading(MAYPORT),
        target: { type: 'topic', id: t.id },
        reason: 'HARASSMENT',
      },
    });
    expect(rep.status).toBe(202); // reports are accepted for review
    const cases = (await listCases()).rows;
    expect(cases).toEqual([
      expect.objectContaining({
        type: 'topic',
        id: t.id,
        author: expect.objectContaining({ id: me.id }),
      }),
    ]);
    const admin = await adminHeaders((await createTestUser('ct_admin', { role: 'ADMIN' })).id);
    const decide = (decision: string) =>
      call(caseDecidePOST as H, 'POST', {
        headers: admin,
        params: { type: 'topic', id: t.id },
        body: { decision, reason: 'Harassing title' },
      });
    expect((await decide('remove')).status).toBe(200);
    expect(titles(await page(near.token, { scope: 'city' }))).toEqual([]);
    const postIn = await call(postsPOST as H, 'POST', {
      token: near.token,
      body: { reading: reading(), body: 'hi', topicId: t.id },
    });
    expect(postIn.status).toBe(404);
    // Restore it (approve brings it back).
    expect((await decide('approve')).status).toBe(200);
    expect(titles(await page(near.token, { scope: 'city' }))).toEqual(['Rude topic title here']);
  });
});

describe('polls (D133)', () => {
  async function openPoll() {
    const p = await db.poll.create({
      data: {
        question: 'Best bridge?',
        opensAt: new Date(Date.now() - DAY),
        closesAt: new Date(Date.now() + DAY),
        choices: {
          create: ['Main Street', 'Acosta'].map((label, position) => ({ label, position })),
        },
      },
      include: { choices: { orderBy: { position: 'asc' } } },
    });
    return { id: p.id, choices: p.choices.map((c) => c.id) };
  }

  it('live results right after you vote, with how many voted; none before', async () => {
    const p = await openPoll();
    const results = async (token: string) =>
      (await call(pollsGET as H, 'GET', { token })).body.open[0].results;
    expect(await results(me.token)).toBeNull();
    await call(votePOST as H, 'POST', {
      token: near.token,
      id: p.id,
      body: { reading: reading(NEAR), choiceIds: [p.choices[1]] },
    });
    const r = await call(votePOST as H, 'POST', {
      token: me.token,
      id: p.id,
      body: { reading: reading(), choiceIds: [p.choices[0]] },
    });
    expect(r.body.poll.results).toMatchObject({
      voters: 2,
      counts: [
        { choiceId: p.choices[0], count: 1 },
        { choiceId: p.choices[1], count: 1 },
      ],
      areas: [],
    });
    expect(await results(far.token)).toBeNull(); // hasn't voted: no results
  });

  it('suggest a poll question; the admin uses or declines it', async () => {
    const s = await call(pollSuggestPOST as H, 'POST', {
      token: me.token,
      body: { question: 'Should the Riverwalk get more lights?', topic: 'city' },
    });
    expect(s.status).toBe(201);
    const unconfirmed = await person('ct_unconf2', false);
    expect(
      (
        await call(pollSuggestPOST as H, 'POST', {
          token: unconfirmed.token,
          body: { question: 'Another question here' },
        })
      ).status,
    ).toBe(403);
    const admin = await adminHeaders((await createTestUser('ct_admin2', { role: 'ADMIN' })).id);
    const decide = (body: Record<string, unknown>) =>
      call(suggestionDecidePOST as H, 'POST', { headers: admin, id: s.body.id, body });
    expect((await decide({ action: 'use' })).status).toBe(200);
    expect((await decide({ action: 'reject', reason: 'dup' })).body.error.code).toBe(
      'ALREADY_DECIDED',
    );
    expect((await db.pollSuggestion.findUniqueOrThrow({ where: { id: s.body.id } })).status).toBe(
      'USED',
    );
  });
});
