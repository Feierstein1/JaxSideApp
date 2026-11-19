import { beforeEach, describe, expect, it } from 'vitest';
import { POST as caseDecidePOST } from '@/app/api/v1/admin/cases/[type]/[id]/route';
import { POST as actionPOST } from '@/app/api/v1/admin/users/[id]/actions/route';
import { adminTopicPosts, topicPostTab } from '@/server/admin/topic-posts';
import { db } from '@/server/db';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// Admin → Topics → one topic: its posts, moderated where they sit.

let admin: Record<string, string>;
let topicId: string;
let ann: { id: string };
let bo: { id: string };

type Status = 'VISIBLE' | 'HELD_FOR_REVIEW' | 'REMOVED';
/** A post at Five Points (every post needs a location), in `topic` (null: the local feed). */
async function post(
  authorId: string,
  body: string,
  status: Status = 'VISIBLE',
  minutesAgo = 0,
  topic: string | null = topicId,
) {
  const [row] = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO "GeneralPost" (id, "authorId", body, status, "topicId", location, "createdAt", "updatedAt")
    VALUES (gen_random_uuid(), ${authorId}::uuid, ${body}, ${status}::"ContentStatus",
            ${topic}::uuid, ST_SetSRID(ST_MakePoint(-81.6853, 30.3149), 4326)::geography,
            ${new Date(Date.now() - minutesAgo * 60_000)}, now())
    RETURNING id`;
  return row!;
}

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  admin = await adminHeaders((await createTestUser('mod_t', { role: 'ADMIN' })).id);
  ann = await createTestUser('ann_t');
  bo = await createTestUser('bo_t');
  topicId = (await db.cityTopic.create({ data: { title: 'Game day', status: 'ACTIVE' } })).id;
});

describe('a topic’s posts in the admin portal', () => {
  it('lists the topic’s posts newest first, by tab, with counts and each author’s next step', async () => {
    await post(ann.id, 'Older', 'VISIBLE', 10);
    await post(bo.id, 'Newer', 'VISIBLE', 1);
    await post(ann.id, 'Waiting', 'HELD_FOR_REVIEW');
    // Another topic's post and a local-feed post stay out.
    const other = await db.cityTopic.create({ data: { title: 'Other', status: 'ACTIVE' } });
    await post(ann.id, 'Elsewhere', 'VISIBLE', 0, other.id);
    await post(ann.id, 'Local', 'VISIBLE', 0, null);

    const v = await adminTopicPosts(topicId, 'visible', 1);
    expect(v.topic.title).toBe('Game day');
    expect(v.counts).toEqual({ visible: 2, held: 1, removed: 0 });
    expect(v.posts.rows.map((p) => p.body)).toEqual(['Newer', 'Older']);
    expect(v.posts.rows[0]!.author).toMatchObject({ username: 'bo_t', step: 'warning' });
    expect((await adminTopicPosts(topicId, 'held', 1)).posts.rows.map((p) => p.body)).toEqual([
      'Waiting',
    ]);
    expect(topicPostTab('nonsense')).toBe('visible');
    await expect(
      adminTopicPosts('00000000-0000-7000-8000-000000000000', 'visible', 1),
    ).rejects.toThrow('Topic not found');
  });

  it('pages 20 at a time', async () => {
    for (let i = 0; i < 23; i++) await post(ann.id, `Post ${i}`, 'VISIBLE', i);
    const p1 = await adminTopicPosts(topicId, 'visible', 1);
    const p2 = await adminTopicPosts(topicId, 'visible', 2);
    expect(p1.posts.rows).toHaveLength(20);
    expect(p2.posts.rows.map((p) => p.body)).toEqual(['Post 20', 'Post 21', 'Post 22']);
    expect(p1.posts.total).toBe(23);
  });

  // What the Moderate form sends: a post nobody reported can be removed, then its author struck.
  it('removes an unreported post and strikes its author; the next step moves up', async () => {
    const p = await post(ann.id, 'Rude');
    const r = await call(caseDecidePOST as H, 'POST', {
      headers: admin,
      params: { type: 'general', id: p.id },
      body: { decision: 'remove', reason: 'Be kind', notifyAuthor: true },
    });
    expect(r.status).toBe(200);
    const s = await call(actionPOST as H, 'POST', {
      headers: admin,
      params: { id: ann.id },
      body: { action: 'strike', reason: 'Be kind' },
    });
    expect(s.status).toBe(200);
    const after = await adminTopicPosts(topicId, 'removed', 1);
    expect(after.counts).toMatchObject({ visible: 0, removed: 1 });
    expect(after.posts.rows[0]).toMatchObject({
      body: 'Rude',
      author: { step: '1 day suspension' },
    });
    expect(
      await db.notification.count({ where: { userId: ann.id, type: 'CONTENT_REMOVED' } }),
    ).toBe(1);
  });

  // 🔒 Admin pages only.
  it('the actions need an admin session', async () => {
    const p = await post(ann.id, 'Hi');
    const r = await call(caseDecidePOST as H, 'POST', {
      params: { type: 'general', id: p.id },
      body: { decision: 'remove' },
    });
    expect(r.status).toBe(401);
    expect((await db.generalPost.findUniqueOrThrow({ where: { id: p.id } })).status).toBe(
      'VISIBLE',
    );
  });
});
