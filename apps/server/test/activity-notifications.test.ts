import { beforeEach, describe, expect, it } from 'vitest';
import { GET as bellGET } from '@/app/api/v1/notifications/route';
import { POST as commentPOST } from '@/app/api/v1/posts/[id]/comments/route';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { PUT as blockPUT } from '@/app/api/v1/users/[username]/block/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { invalidateScreeningCache } from '@/server/moderation/screening';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D156: notifications for comments on your post, replies to your comments and @mentions.

const DAY = 86_400_000;
const HERE = { latitude: 30.3149, longitude: -81.6853 }; // Riverside
const reading = () => ({ ...HERE, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

type P = { id: string; token: string; name: string };
async function person(name: string): Promise<P> {
  const u = await createTestUser(name, {
    emailVerifiedAt: new Date(),
    createdAt: new Date(Date.now() - 10 * DAY),
  });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token, name };
}
const post = async (by: P, body: string) =>
  (await call(postsPOST as H, 'POST', { token: by.token, body: { reading: reading(), body } })).body
    .post.id as string;
const comment = async (by: P, postId: string, body: string, parentCommentId?: string) =>
  call(commentPOST as H, 'POST', {
    token: by.token,
    id: postId,
    body: { reading: reading(), body, ...(parentCommentId ? { parentCommentId } : {}) },
  });
const bell = async (p: P) =>
  (await call(bellGET as H, 'GET', { token: p.token })).body.notifications as {
    type: string;
    actor: { username: string } | null;
    target: { kind: string; postId: string; commentId: string | null } | null;
    where: string | null;
    count: number;
  }[];

let ann: P;
let bob: P;
let cat: P;
beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  await importServiceArea(db, readBoundaryFile());
  invalidateConfigCache();
  invalidateScreeningCache();
  ann = await person('ann_n');
  bob = await person('bob_n');
  cat = await person('cat_n');
}, 60_000);

describe('comments on your post (D156)', () => {
  it('notifies the author with a link to the comment, and combines unread ones', async () => {
    const p = await post(ann, 'Anyone else hear the parade practicing?');
    const c1 = (await comment(bob, p, 'Yes! It was loud.')).body.id as string;
    let mine = await bell(ann);
    expect(mine).toEqual([
      expect.objectContaining({
        type: 'POST_COMMENT',
        actor: expect.objectContaining({ username: 'bob_n' }),
        target: { kind: 'general', postId: p, commentId: c1 },
        count: 1,
      }),
    ]);
    expect(mine[0]!.where).toBeTruthy(); // the neighborhood, e.g. "Riverside"

    const c2 = (await comment(cat, p, 'Same here, every evening.')).body.id as string;
    mine = await bell(ann);
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({
      count: 2,
      actor: expect.objectContaining({ username: 'cat_n' }),
      target: { commentId: c2 },
    });
    // 🔒 The bell never carries the text; it shows when the post is opened, in the area.
    expect(JSON.stringify(mine)).not.toMatch(/loud|evening|parade/);
  });

  it('never notifies you about your own comment', async () => {
    const p = await post(ann, 'Lost a gray cat with a red collar.');
    await comment(ann, p, 'Update: still looking.');
    expect(await bell(ann)).toEqual([]);
  });
});

describe('replies and mentions (D156)', () => {
  it('tells the person replied to; one notification each even if mentioned too', async () => {
    const p = await post(ann, 'Free mulch on the corner.');
    const top = (await comment(bob, p, 'Is it still there?')).body.id as string;
    const reply = (await comment(cat, p, '@bob_n yes, plenty left', top)).body.id as string;
    expect(await bell(bob)).toEqual([
      expect.objectContaining({
        type: 'COMMENT_REPLY',
        target: expect.objectContaining({ commentId: reply }),
      }),
    ]);
    // The post's author hears about both comments (combined).
    expect((await bell(ann))[0]).toMatchObject({ type: 'POST_COMMENT', count: 2 });
  });

  it('notifies people @mentioned in a post, at most three', async () => {
    const others = await Promise.all(['dan_n', 'eve_n', 'fay_n'].map((n) => person(n)));
    await post(ann, 'Thanks @bob_n @cat_n @dan_n @eve_n @fay_n @nobody_here for the help!');
    const told = [];
    for (const p of [bob, cat, ...others]) if ((await bell(p)).length) told.push(p.name);
    expect(told).toEqual(['bob_n', 'cat_n', 'dan_n']);
    expect((await bell(bob))[0]).toMatchObject({
      type: 'MENTION',
      target: expect.objectContaining({ kind: 'general', commentId: null }),
    });
  });

  // 🔒 A block stops notifications both ways, and held comments notify no one.
  it('skips blocked people and held comments', async () => {
    const p = await post(ann, 'Morning walk crew meets at 7.');
    await call(blockPUT as H, 'PUT', { token: ann.token, params: { username: 'bob_n' }, body: {} });
    await comment(bob, p, 'I will be there @cat_n');
    expect(await bell(ann)).toEqual([]); // ann blocked bob
    await db.screeningRule.create({
      data: { term: 'zorbcake', action: 'HOLD', category: 'OTHER' },
    });
    invalidateScreeningCache();
    const held = await comment(cat, p, 'zorbcake for everyone');
    expect(held.status).toBe(202);
    expect(await bell(ann)).toEqual([]);
  });
});
