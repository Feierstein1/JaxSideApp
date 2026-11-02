import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { POST as removeCommentRoute } from '@/app/api/places/[placeId]/comments/[commentId]/delete/route';
import { POST as removePostRoute } from '@/app/api/places/[placeId]/posts/[postId]/delete/route';
import { POST as replyRoute } from '@/app/api/places/[placeId]/posts/[postId]/replies/route';
import { GET as threadRoute } from '@/app/api/places/[placeId]/posts/[postId]/route';
import { GET as listRoute, POST as postRoute } from '@/app/api/places/[placeId]/posts/route';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { invalidateScreeningCache } from '@/server/screening';
import {
  authed,
  makeAccount,
  makeAppUser,
  makePlace,
  resetBusinessData,
  signIn,
  type Browser,
} from './helpers';

// Route params as Next passes them (`never`: each route types its own).
const ctx = (params: Record<string, string>) => ({ params: Promise.resolve(params) }) as never;

let placeId: string;
let ownerS: Browser;
let staffS: Browser;
let staffId: string;

const list = (b: Browser, place = placeId) =>
  listRoute(authed('GET', `/api/places/${place}/posts`, b), ctx({ placeId: place }));
const thread = (b: Browser, postId: string, place = placeId) =>
  threadRoute(
    authed('GET', `/api/places/${place}/posts/${postId}`, b),
    ctx({ placeId: place, postId }),
  );
const write = (b: Browser, body: object, place = placeId) =>
  postRoute(authed('POST', `/api/places/${place}/posts`, b, body), ctx({ placeId: place }));
const reply = (b: Browser, postId: string, body: object, place = placeId) =>
  replyRoute(
    authed('POST', `/api/places/${place}/posts/${postId}/replies`, b, body),
    ctx({ placeId: place, postId }),
  );

/** A post by a phone-app person, as the app would have saved it. */
async function appPost(body = 'Is the patio open?') {
  const u = await makeAppUser();
  const post = await db.businessPost.create({ data: { placeId, authorId: u.id, body } });
  await db.businessPlace.update({ where: { id: placeId }, data: { postCount: { increment: 1 } } });
  return { post, user: u };
}

beforeEach(async () => {
  await resetBusinessData();
  const owner = await makeAccount();
  const place = await makePlace('Bold Bean');
  placeId = place.id;
  const staff = await db.businessAccount.create({
    data: {
      username: 'sam.bb',
      passwordHash: (await db.businessAccount.findUniqueOrThrow({ where: { id: owner.id } }))
        .passwordHash,
      createdById: owner.id,
    },
  });
  staffId = staff.id;
  await db.businessPlaceAccess.createMany({
    data: [
      { accountId: owner.id, placeId, role: 'OWNER' },
      { accountId: staff.id, placeId, role: 'STAFF', staffName: 'Sam' },
    ],
  });
  ownerS = await signIn();
  staffS = await signIn('sam.bb');
});
afterEach(async () => {
  await db.screeningRule.deleteMany({
    where: { term: { in: ['heldword', 'warnword', 'blockword'] } },
  });
  invalidateScreeningCache();
  await db.appConfiguration.deleteMany({ where: { key: 'comments.limitPerPost' } });
  invalidateConfigCache();
});

describe('B1.6 the place’s discussion', () => {
  it('Staff posts as "The Owner · Sam" from anywhere; the place count moves', async () => {
    const res = await write(staffS, { body: 'Happy hour 4–7 today' });
    expect(res.status).toBe(201);
    const { id, held } = await res.json();
    expect(held).toBe(false);
    const row = await db.businessPost.findUniqueOrThrow({ where: { id } });
    expect(row).toMatchObject({ authorId: null, businessAuthorId: staffId, status: 'VISIBLE' });
    expect((await db.businessPlace.findUniqueOrThrow({ where: { id: placeId } })).postCount).toBe(
      1,
    );
  });

  it('🔒 only the Owner sees which login wrote it', async () => {
    await write(staffS, { body: 'New menu!' });
    const asStaff = await (await list(staffS)).json();
    expect(asStaff.posts[0].author).toEqual({ theOwner: true, staffName: 'Sam' });
    expect(JSON.stringify(asStaff)).not.toContain('sam.bb');
    const asOwner = await (await list(ownerS)).json();
    expect(asOwner.posts[0].author).toEqual({
      theOwner: true,
      staffName: 'Sam',
      writtenBy: 'sam.bb',
    });
  });

  it('lists app posts with public names only, and opens the thread in order', async () => {
    const { post, user } = await appPost();
    const c1 = await db.comment.create({
      data: { businessPostId: post.id, authorKind: 'USER', authorUserId: user.id, body: 'first' },
    });
    await reply(staffS, post.id, { body: 'Yes, until 9!', parentCommentId: c1.id });
    await reply(staffS, post.id, { body: 'Welcome!' });
    const t = await (await thread(ownerS, post.id)).json();
    expect(t.post.author).toEqual({ username: user.username });
    expect(t.comments.map((c: { body: string }) => c.body)).toEqual([
      'first',
      'Yes, until 9!',
      'Welcome!',
    ]);
    expect(t.comments[1]).toMatchObject({ parentCommentId: c1.id, depth: 1, ours: true });
    const raw = JSON.stringify(t);
    expect(raw).not.toMatch(/authorUserId|userId|email|passwordHash/);
  });

  it('a reply counts on the post and rings the app bell of the people answered', async () => {
    const { post, user } = await appPost();
    const other = await makeAppUser();
    const c = await db.comment.create({
      data: { businessPostId: post.id, authorKind: 'USER', authorUserId: other.id, body: 'me too' },
    });
    await db.businessPost.update({ where: { id: post.id }, data: { commentCount: 1 } });
    expect((await reply(staffS, post.id, { body: 'Thanks!', parentCommentId: c.id })).status).toBe(
      201,
    );
    expect((await reply(staffS, post.id, { body: 'And welcome!' })).status).toBe(201);
    expect((await db.businessPost.findUniqueOrThrow({ where: { id: post.id } })).commentCount).toBe(
      3,
    );

    const bell = await db.notification.findMany({ orderBy: { createdAt: 'asc' } });
    expect(bell.map((n) => [n.userId, n.type, n.count])).toEqual([
      [other.id, 'COMMENT_REPLY', 1],
      [user.id, 'POST_COMMENT', 2], // unread comments on one post stay one row
    ]);
    expect(bell.every((n) => n.actorBusinessId === staffId && n.actorId === null)).toBe(true);
  });

  it('screening: blocked text is refused, held text waits for a moderator, warnings ask first', async () => {
    await db.screeningRule.createMany({
      data: [
        { term: 'blockword', match: 'WORD', action: 'BLOCK', category: 'OTHER' },
        { term: 'heldword', match: 'WORD', action: 'HOLD', category: 'HARASSMENT' },
        { term: 'warnword', match: 'WORD', action: 'WARN', category: 'OTHER' },
      ],
    });
    invalidateScreeningCache();
    expect((await write(staffS, { body: 'this is a blockword' })).status).toBe(422);

    const held = await (await write(staffS, { body: 'this is a heldword' })).json();
    expect(held.held).toBe(true);
    expect(await db.report.findFirst({ where: { businessPostId: held.id } })).toMatchObject({
      reason: 'HARASSMENT',
      reporterUserId: null,
    });
    expect((await db.businessPlace.findUniqueOrThrow({ where: { id: placeId } })).postCount).toBe(
      0,
    );
    // The business sees its own held post, labelled.
    expect((await (await list(staffS)).json()).posts[0]).toMatchObject({ id: held.id, held: true });

    const warned = await write(staffS, { body: 'a warnword here' });
    expect(warned.status).toBe(409);
    expect((await warned.json()).error.code).toBe('CONTENT_WARNING');
    expect((await write(staffS, { body: 'a warnword here', confirmWarning: true })).status).toBe(
      201,
    );

    const { post } = await appPost();
    const heldReply = await (await reply(staffS, post.id, { body: 'heldword' })).json();
    expect(heldReply.held).toBe(true);
    expect(await db.report.count({ where: { commentId: heldReply.id } })).toBe(1);
    expect(await db.notification.count()).toBe(0); // nobody is told about held replies
  });

  it('a post at its comment limit takes no more replies', async () => {
    await db.appConfiguration.upsert({
      where: { key: 'comments.limitPerPost' },
      create: { key: 'comments.limitPerPost', value: 1 },
      update: { value: 1 },
    });
    invalidateConfigCache();
    const { post } = await appPost();
    expect((await reply(staffS, post.id, { body: 'one' })).status).toBe(201);
    expect((await reply(staffS, post.id, { body: 'two' })).status).toBe(409);
  });

  it('removing: Staff removes their own; the Owner removes anything the business wrote', async () => {
    const mine = (await (await write(staffS, { body: 'staff post' })).json()).id;
    const owners = (await (await write(ownerS, { body: 'owner post' })).json()).id;
    const remove = (b: Browser, postId: string) =>
      removePostRoute(
        authed('POST', `/api/places/${placeId}/posts/${postId}/delete`, b, {}),
        ctx({ placeId, postId }),
      );
    expect((await remove(staffS, owners)).status).toBe(404);
    expect((await remove(staffS, mine)).status).toBe(200);
    expect((await remove(ownerS, owners)).status).toBe(200);
    expect((await db.businessPlace.findUniqueOrThrow({ where: { id: placeId } })).postCount).toBe(
      0,
    );

    const { post } = await appPost();
    expect((await remove(ownerS, post.id)).status).toBe(404); // never someone else's post
    const r = (await (await reply(staffS, post.id, { body: 'oops' })).json()).id;
    const removeReply = await removeCommentRoute(
      authed('POST', `/api/places/${placeId}/comments/${r}/delete`, ownerS, {}),
      ctx({ placeId, commentId: r }),
    );
    expect(removeReply.status).toBe(200);
    expect((await db.businessPost.findUniqueOrThrow({ where: { id: post.id } })).commentCount).toBe(
      0,
    );
  });
});

describe('🔒 B1.6 only members of that place, only that place', () => {
  it('another business can’t read or write here, even with the ids', async () => {
    const { post } = await appPost();
    const other = await makeAccount({ email: 'other@example.com' });
    const theirs = await makePlace('Other Place');
    await db.businessPlaceAccess.create({
      data: { accountId: other.id, placeId: theirs.id, role: 'OWNER' },
    });
    const them = await signIn('other@example.com');
    expect((await list(them)).status).toBe(404);
    expect((await thread(them, post.id)).status).toBe(404);
    expect((await write(them, { body: 'spam' })).status).toBe(404);
    expect((await reply(them, post.id, { body: 'spam' })).status).toBe(404);
    // Their own place, but our post id: still not found.
    expect((await thread(them, post.id, theirs.id)).status).toBe(404);
    expect((await reply(them, post.id, { body: 'spam' }, theirs.id)).status).toBe(404);
    expect(await db.comment.count()).toBe(0);
    expect(await db.businessPost.count({ where: { businessAuthorId: other.id } })).toBe(0);
  });

  it('removed staff lose the discussion straight away', async () => {
    await db.businessPlaceAccess.updateMany({
      where: { accountId: staffId },
      data: { revokedAt: new Date() },
    });
    expect((await list(staffS)).status).toBe(404);
    expect((await write(staffS, { body: 'still here?' })).status).toBe(404);
  });

  it('a phone-app session can’t write through the business site', async () => {
    const res = await postRoute(
      new Request(`http://business.test/api/places/${placeId}/posts`, {
        method: 'POST',
        headers: {
          host: 'business.test',
          'content-type': 'application/json',
          authorization: 'Bearer whatever',
        },
        body: JSON.stringify({ body: 'hi' }),
      }),
      ctx({ placeId }),
    );
    expect(res.status).toBe(401);
  });
});
