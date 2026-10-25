import { beforeEach, describe, expect, it } from 'vitest';
import { POST as adminCreatePOST } from '@/app/api/v1/admin/topics/route';
import { POST as adminDecidePOST } from '@/app/api/v1/admin/topics/[id]/decide/route';
import { PATCH as adminPATCH } from '@/app/api/v1/admin/topics/[id]/route';
import { POST as feedPOST } from '@/app/api/v1/feed/route';
import { POST as guestsPOST } from '@/app/api/v1/guests/route';
import { POST as installPOST } from '@/app/api/v1/installations/route';
import { POST as commentPOST } from '@/app/api/v1/posts/[id]/comments/route';
import { POST as postDetailPOST } from '@/app/api/v1/posts/[id]/route';
import { PUT as votePUT } from '@/app/api/v1/posts/[id]/vote/route';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { POST as topicListPOST } from '@/app/api/v1/topics/[id]/posts/list/route';
import { GET as topicsGET } from '@/app/api/v1/topics/route';
import { GET as suggestionsGET, POST as suggestPOST } from '@/app/api/v1/topics/suggestions/route';
import { createSession } from '@/server/auth/sessions';
import { db } from '@/server/db';
import { INSTALLATION_HEADER } from '@/server/installations';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { findForbiddenKeys } from '@/server/serializers';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D125: citywide discussion topics.
const HOUR = 3_600_000;
const DOWNTOWN = { latitude: 30.3274, longitude: -81.6588 };
const MAYPORT = { latitude: 30.3919, longitude: -81.4307 }; // ~14 mi away, still in Duval
const OUT = { latitude: 30.4, longitude: -81.2 }; // ocean, outside Duval
const reading = (at = DOWNTOWN) => ({ ...at, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

let topicId: string;
let me: { id: string; token: string };
let far: { id: string; token: string };

async function person(name: string, verified = true) {
  const u = await createTestUser(name, { emailVerifiedAt: verified ? new Date() : null });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
}

const postIn = (token: string, topic: string | undefined, at = DOWNTOWN, body = 'Go Jags!') =>
  call(postsPOST as H, 'POST', {
    token,
    body: { reading: reading(at), body, ...(topic ? { topicId: topic } : {}) },
  });
const listTopic = (token: string, id: string, at = DOWNTOWN) =>
  call(topicListPOST as H, 'POST', { token, id, body: { reading: reading(at) } });

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  await importServiceArea(db, readBoundaryFile());
  topicId = (await db.cityTopic.create({ data: { title: 'Game day: Jaguars vs Titans' } })).id;
  me = await person('topic_me');
  far = await person('topic_far');
}, 60_000);

describe('posting in a topic', () => {
  it('is citywide: kept out of the local feed, no distance, readable across the city', async () => {
    const r = await postIn(me.token, topicId);
    expect(r.status).toBe(201);
    expect(r.body.post).toMatchObject({
      topic: { id: topicId, title: 'Game day: Jaguars vs Titans' },
      distanceMeters: null,
    });
    const local = await postIn(me.token, undefined, DOWNTOWN, 'A local post');
    expect(local.body.post.topic).toBeNull();

    // The local feed right here shows only the local post.
    const feed = await call(feedPOST as H, 'POST', {
      token: me.token,
      body: { reading: reading(DOWNTOWN) },
    });
    expect(feed.body.posts.map((p: { body: string }) => p.body)).toEqual(['A local post']);

    // From 14 miles away the topic shows the post, without a distance.
    const list = await listTopic(far.token, topicId, MAYPORT);
    expect(list.status).toBe(200);
    expect(list.body.topic).toMatchObject({ id: topicId, status: 'open', postCount: 1 });
    expect(list.body.posts).toHaveLength(1);
    expect(list.body.posts[0]).toMatchObject({ body: 'Go Jags!', distanceMeters: null });
    expect(findForbiddenKeys(list.body)).toEqual([]);
  });

  it('comments and votes work from anywhere in Duval (no radius)', async () => {
    const id = (await postIn(me.token, topicId)).body.post.id;
    const c = await call(commentPOST as H, 'POST', {
      token: far.token,
      id,
      body: { reading: reading(MAYPORT), body: 'Duuuval' },
    });
    expect(c.status).toBe(201);
    const v = await call(votePUT as H, 'PUT', {
      token: far.token,
      id,
      body: { reading: reading(MAYPORT), value: 1 },
    });
    expect(v.status).toBe(200);
    const detail = await call(postDetailPOST as H, 'POST', {
      token: far.token,
      id,
      body: { reading: reading(MAYPORT) },
    });
    expect(detail.body.canComment).toBe(true);
  });

  // 🔒 Still inside Duval only.
  it('refuses readings outside Duval', async () => {
    expect((await postIn(me.token, topicId, OUT)).status).toBe(403);
    expect((await listTopic(me.token, topicId, OUT)).status).toBe(403);
  });

  it('a closed topic stays readable but takes no posts, comments or votes', async () => {
    const id = (await postIn(me.token, topicId)).body.post.id;
    await db.cityTopic.update({ where: { id: topicId }, data: { status: 'CLOSED' } });
    expect((await postIn(me.token, topicId)).body.error.code).toBe('TOPIC_CLOSED');
    const c = await call(commentPOST as H, 'POST', {
      token: far.token,
      id,
      body: { reading: reading(MAYPORT), body: 'late' },
    });
    expect(c.body.error.code).toBe('TOPIC_CLOSED');
    const v = await call(votePUT as H, 'PUT', {
      token: far.token,
      id,
      body: { reading: reading(MAYPORT), value: 1 },
    });
    expect(v.body.error.code).toBe('TOPIC_CLOSED');
    const list = await listTopic(far.token, topicId, MAYPORT);
    expect(list.body.topic.status).toBe('closed');
    expect(list.body.posts).toHaveLength(1);
  });

  it('a topic past its end time is closed too; a scheduled one is hidden', async () => {
    await db.cityTopic.update({
      where: { id: topicId },
      data: { opensAt: new Date(Date.now() - 2 * HOUR), closesAt: new Date(Date.now() - HOUR) },
    });
    expect((await postIn(me.token, topicId)).body.error.code).toBe('TOPIC_CLOSED');
    const later = await db.cityTopic.create({
      data: { title: 'Next week', opensAt: new Date(Date.now() + HOUR) },
    });
    expect((await postIn(me.token, later.id)).status).toBe(404);
    const topics = await call(topicsGET as H, 'GET', { token: me.token });
    expect(topics.body.open).toEqual([]);
    expect(topics.body.closed.map((t: { id: string }) => t.id)).toEqual([topicId]);
  });

  it('lists open topics pinned first; guests can read them', async () => {
    const pinned = await db.cityTopic.create({ data: { title: 'Election day', pinned: true } });
    const inst = (await call(installPOST as H, 'POST', { body: {} })).body.installationToken;
    const guest = await call(guestsPOST as H, 'POST', {
      body: {},
      headers: { [INSTALLATION_HEADER]: inst },
    });
    const r = await call(topicsGET as H, 'GET', { token: guest.body.token });
    expect(r.status).toBe(200);
    expect(r.body.open.map((t: { id: string }) => t.id)).toEqual([pinned.id, topicId]);
    expect((await listTopic(guest.body.token, topicId)).status).toBe(200);
    expect((await call(topicsGET as H, 'GET', {})).status).toBe(401);
  });
});

describe('suggestions', () => {
  let admin: Record<string, string>;
  beforeEach(async () => {
    admin = await adminHeaders((await createTestUser('topic_admin', { role: 'ADMIN' })).id);
  });
  const suggest = (token: string, title: string, category?: string) =>
    call(suggestPOST as H, 'POST', { token, body: { title, ...(category ? { category } : {}) } });
  const decide = (id: string, body: Record<string, unknown>) =>
    call(adminDecidePOST as H, 'POST', { headers: admin, id, body });
  const mine = async (token: string) =>
    (await call(suggestionsGET as H, 'GET', { token })).body.suggestions;

  it('a suggestion waits, then the admin approves it (reworded) and it appears', async () => {
    const s = await suggest(me.token, 'best tacos??', 'food_fun');
    expect(s.status).toBe(201);
    expect(await mine(me.token)).toMatchObject([{ title: 'best tacos??', status: 'waiting' }]);
    let open = (await call(topicsGET as H, 'GET', { token: far.token })).body.open;
    expect(open.map((t: { id: string }) => t.id)).toEqual([topicId]);
    expect((await postIn(far.token, s.body.id)).status).toBe(404); // not a topic yet

    expect(
      (
        await decide(s.body.id, {
          action: 'approve',
          title: 'Best tacos in Jax',
          category: 'community',
        })
      ).status,
    ).toBe(200);
    open = (await call(topicsGET as H, 'GET', { token: far.token })).body.open;
    // D131: the admin can move it to another category while approving.
    expect(open.find((t: { title: string }) => t.title === 'Best tacos in Jax')).toMatchObject({
      category: 'community',
    });
    expect(open.find((t: { id: string }) => t.id === topicId)).toMatchObject({ category: 'other' });
    expect(await mine(me.token)).toMatchObject([{ status: 'approved', reason: null }]);
    expect((await decide(s.body.id, { action: 'reject', reason: 'dup' })).body.error.code).toBe(
      'ALREADY_DECIDED',
    );
  });

  it('a rejected suggestion shows the reason to its author only', async () => {
    const s = await suggest(me.token, 'Who is the worst neighbor');
    await decide(s.body.id, { action: 'reject', reason: 'Not about a topic for everyone.' });
    expect(await mine(me.token)).toMatchObject([
      { status: 'rejected', reason: 'Not about a topic for everyone.' },
    ]);
    expect(await mine(far.token)).toEqual([]);
  });

  // 🔒 Confirmed accounts only, 3 a day.
  it('needs a confirmed account, and allows 3 a day', async () => {
    const unconfirmed = await person('topic_unconf', false);
    expect((await suggest(unconfirmed.token, 'Hello there')).status).toBe(403);
    for (let i = 0; i < 3; i++)
      expect((await suggest(me.token, `Idea ${i} here`)).status).toBe(201);
    expect((await suggest(me.token, 'One more idea')).status).toBe(429);
  });
});

describe('admin', () => {
  let admin: Record<string, string>;
  beforeEach(async () => {
    admin = await adminHeaders((await createTestUser('topic_admin', { role: 'ADMIN' })).id);
  });

  it('creates, edits, closes and reopens topics, all audited', async () => {
    const c = await call(adminCreatePOST as H, 'POST', {
      headers: admin,
      body: {
        title: 'RAM weekend',
        category: 'community',
        description: 'Remote Area Medical clinic',
        pinned: true,
      },
    });
    expect(c.status).toBe(201);
    const id = c.body.id as string;
    expect((await db.cityTopic.findUniqueOrThrow({ where: { id } })).category).toBe('community');
    const e = await call(adminPATCH as H, 'PATCH', {
      headers: admin,
      id,
      body: { title: 'RAM clinic weekend', pinned: false },
    });
    expect(e.status).toBe(200);
    expect((await db.cityTopic.findUniqueOrThrow({ where: { id } })).title).toBe(
      'RAM clinic weekend',
    );
    const close = await call(adminDecidePOST as H, 'POST', {
      headers: admin,
      id,
      body: { action: 'close' },
    });
    expect(close.status).toBe(200);
    expect((await postIn(me.token, id)).body.error.code).toBe('TOPIC_CLOSED');
    await call(adminDecidePOST as H, 'POST', { headers: admin, id, body: { action: 'reopen' } });
    expect((await postIn(me.token, id)).status).toBe(201);
    expect(await db.adminAuditLog.count({ where: { action: { startsWith: 'TOPIC_' } } })).toBe(4);
  });

  it('validates input and refuses app users', async () => {
    const bad = [
      { title: 'x' },
      { title: 'Good title', closesAt: '2026-01-01T00:00:00Z', opensAt: '2026-02-01T00:00:00Z' },
      { title: 'Good title', role: 'ADMIN' },
      { title: 'Good title', category: 'gossip' },
    ];
    for (const b of bad) {
      expect((await call(adminCreatePOST as H, 'POST', { headers: admin, body: b })).status).toBe(
        400,
      );
    }
    const asUser = await call(adminCreatePOST as H, 'POST', {
      token: me.token,
      body: { title: 'Sneaky topic' },
    });
    expect(asUser.status).toBe(401);
  });
});
