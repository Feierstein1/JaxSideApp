import { beforeEach, describe, expect, it } from 'vitest';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { POST as reportPOST } from '@/app/api/v1/reports/route';
import { DELETE as topicDELETE, PATCH as topicPATCH } from '@/app/api/v1/topics/[id]/route';
import { POST as pagePOST } from '@/app/api/v1/topics/list/route';
import { POST as createPOST } from '@/app/api/v1/topics/route';
import { adminListTopics, purgeDeletedTopics } from '@/server/topics';
import { listCases } from '@/server/admin/queue';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D134: topic rules: show-creator choice, delete (not edit), a week's keep, 15-report hold,
// My created discussions.
const DAY = 86_400_000;
const AT = { latitude: 30.3274, longitude: -81.6588 };
const reading = () => ({ ...AT, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

let me: { id: string; token: string };
let other: { id: string; token: string };

async function person(name: string) {
  const u = await createTestUser(name, {
    emailVerifiedAt: new Date(),
    createdAt: new Date(Date.now() - 10 * DAY),
  });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
}
const create = async (token: string, body: Record<string, unknown>) =>
  (
    await call(createPOST as H, 'POST', {
      token,
      body: { reading: reading(), scope: 'city', ...body },
    })
  ).body.topic;
const list = async (token: string, extra: Record<string, unknown> = {}) =>
  (
    await call(pagePOST as H, 'POST', {
      token,
      body: { reading: reading(), scope: 'city', ...extra },
    })
  ).body.topics as { id: string; title: string; creator: string | null; isMine: boolean }[];

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  await importServiceArea(db, readBoundaryFile());
  invalidateConfigCache();
  me = await person('tr_me');
  other = await person('tr_other');
}, 60_000);

describe('showing the creator', () => {
  it('is off by default; on when chosen; the creator can switch it either way', async () => {
    const hidden = await create(me.token, { title: 'Quiet topic here' });
    expect(hidden).toMatchObject({ creator: null, showCreator: false, isMine: true });
    const shown = await create(me.token, { title: 'Named topic here', showCreator: true });
    expect(shown.creator).toBe('tr_me');

    const seen = await list(other.token);
    expect(seen.find((t) => t.id === shown.id)).toMatchObject({ creator: 'tr_me', isMine: false });
    expect(seen.find((t) => t.id === hidden.id)?.creator).toBeNull();
    expect(JSON.stringify(seen)).not.toContain('showCreator'); // only sent to the creator

    const p = await call(topicPATCH as H, 'PATCH', {
      token: me.token,
      id: shown.id,
      body: { showCreator: false },
    });
    expect(p.body.topic.creator).toBeNull();
  });

  // 🔒 Nobody else can change or delete it, and the title can't be edited.
  it('only the creator can change it, and only that one setting', async () => {
    const t = await create(me.token, { title: 'Mine to change' });
    const hijack = await call(topicPATCH as H, 'PATCH', {
      token: other.token,
      id: t.id,
      body: { showCreator: true },
    });
    expect(hijack.status).toBe(404);
    const edit = await call(topicPATCH as H, 'PATCH', {
      token: me.token,
      id: t.id,
      body: { showCreator: true, title: 'New title' },
    });
    expect(edit.status).toBe(400);
    expect((await call(topicDELETE as H, 'DELETE', { token: other.token, id: t.id })).status).toBe(
      404,
    );
  });
});

describe('deleting', () => {
  it('hides it at once, keeps it a week for the admin, then removes it with its posts', async () => {
    const t = await create(me.token, { title: 'Soon gone topic' });
    const post = await call(postsPOST as H, 'POST', {
      token: other.token,
      body: { reading: reading(), body: 'A post in it', topicId: t.id },
    });
    expect(post.status).toBe(201);

    expect((await call(topicDELETE as H, 'DELETE', { token: me.token, id: t.id })).status).toBe(
      200,
    );
    expect(await list(other.token)).toEqual([]);
    const again = await call(postsPOST as H, 'POST', {
      token: other.token,
      body: { reading: reading(), body: 'Too late', topicId: t.id },
    });
    expect(again.status).toBe(404);
    expect((await adminListTopics()).find((x) => x.id === t.id)).toMatchObject({
      status: 'DELETED',
      posts: 1,
    });

    expect(await purgeDeletedTopics()).toBe(0); // within the week: kept
    expect(await purgeDeletedTopics(new Date(Date.now() + 8 * DAY))).toBe(1);
    expect(await db.cityTopic.findUnique({ where: { id: t.id } })).toBeNull();
    const gone = await db.generalPost.findUniqueOrThrow({ where: { id: post.body.post.id } });
    expect(gone).toMatchObject({ status: 'DELETED', topicId: null });
  });
});

describe('reports', () => {
  it('hides a topic once enough different people report it (15 by default)', async () => {
    await db.appConfiguration.create({ data: { key: 'topics.autoHideReports', value: 3 } });
    invalidateConfigCache();
    const t = await create(me.token, { title: 'Reported topic' });
    for (let i = 0; i < 3; i++) {
      const r = await person(`tr_rep${i}`);
      await call(reportPOST as H, 'POST', {
        token: r.token,
        body: { reading: reading(), target: { type: 'topic', id: t.id }, reason: 'SPAM' },
      });
      const status = (await db.cityTopic.findUniqueOrThrow({ where: { id: t.id } })).status;
      expect(status).toBe(i < 2 ? 'ACTIVE' : 'HELD');
    }
    expect(await list(other.token)).toEqual([]);
    expect(await listCases()).toEqual([
      expect.objectContaining({ type: 'topic', id: t.id, contentStatus: 'HELD_FOR_REVIEW' }),
    ]);
  });

  it('defaults to 15', async () => {
    const { CONFIG_DEFAULTS } = await import('@jax/shared');
    expect(CONFIG_DEFAULTS['topics.autoHideReports']).toBe(15);
    expect(CONFIG_DEFAULTS['topics.deletedKeepDays']).toBe(7);
  });
});

describe('My created discussions', () => {
  it('lists only the topics you started', async () => {
    await create(me.token, { title: 'One of mine' });
    await create(other.token, { title: 'Someone else’s' });
    const mine = await list(me.token, { mine: true });
    expect(mine.map((t) => t.title)).toEqual(['One of mine']);
    expect(mine[0]!.isMine).toBe(true);
  });
});
