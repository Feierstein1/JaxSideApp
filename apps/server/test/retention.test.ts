import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { runRetention } from '@/server/jobs/retention';
import { MemoryStore, setObjectStore } from '@/server/media/store';
import { resetDb } from './db-helpers';
import { createTestGuest, createTestUser } from './user-factory';

// P13.7 (D107): how long things are kept. Nothing with an open report is deleted.

const DAY = 86_400_000;
const NOW = new Date('2026-12-01T12:00:00Z');
const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

let store: MemoryStore;
let author: string;
let other: string;

beforeEach(async () => {
  await resetDb();
  invalidateConfigCache();
  store = new MemoryStore();
  setObjectStore(store);
  author = (await createTestUser('ret_author')).id;
  other = (await createTestUser('ret_other')).id;
});

/** A general post with the given status, changed `daysAgo` days before NOW. */
async function post(status: 'VISIBLE' | 'DELETED' | 'REMOVED', daysAgo: number | null) {
  const id = randomUUID();
  await db.$executeRaw`
    INSERT INTO "GeneralPost" (id, "authorId", body, location, status, "statusChangedAt", "updatedAt")
    VALUES (${id}::uuid, ${author}::uuid, 'text',
            ST_SetSRID(ST_MakePoint(-81.6557, 30.3322), 4326)::geography,
            ${status}::"ContentStatus", ${daysAgo === null ? null : ago(daysAgo)}, now())`;
  return id;
}
async function comment(
  postId: string,
  status: 'VISIBLE' | 'DELETED' | 'REMOVED',
  daysAgo: number | null,
  parentCommentId?: string,
) {
  const c = await db.comment.create({
    data: {
      generalPostId: postId,
      parentCommentId,
      depth: parentCommentId ? 1 : 0,
      authorKind: 'USER',
      authorUserId: other,
      body: 'a comment',
      status,
    },
  });
  // Set after creating, so the trigger (which stamps real time) doesn't overwrite it.
  if (daysAgo !== null)
    await db.$executeRaw`UPDATE "Comment" SET "statusChangedAt" = ${ago(daysAgo)} WHERE id = ${c.id}::uuid`;
  return c.id;
}
const openReport = (target: Record<string, string>) =>
  db.report.create({ data: { reporterUserId: other, reason: 'SPAM', ...target } });
const exists = async (table: 'generalPost' | 'comment', id: string) =>
  table === 'generalPost'
    ? !!(await db.generalPost.findUnique({ where: { id } }))
    : !!(await db.comment.findUnique({ where: { id } }));

describe('retention (P13.7, D107)', () => {
  it('a trigger stamps when a post or comment changes status', async () => {
    const p = await post('VISIBLE', null);
    expect(
      (await db.generalPost.findUniqueOrThrow({ where: { id: p } })).statusChangedAt,
    ).toBeNull();
    const before = Date.now() - 1000;
    await db.generalPost.update({ where: { id: p }, data: { status: 'DELETED' } });
    const t = (await db.generalPost.findUniqueOrThrow({ where: { id: p } })).statusChangedAt!;
    expect(t.getTime()).toBeGreaterThanOrEqual(before);
    // Editing the text doesn't count as a status change.
    await db.$executeRaw`UPDATE "GeneralPost" SET "statusChangedAt" = ${ago(5)} WHERE id = ${p}::uuid`;
    await db.generalPost.update({ where: { id: p }, data: { body: 'edited' } });
    expect((await db.generalPost.findUniqueOrThrow({ where: { id: p } })).statusChangedAt).toEqual(
      ago(5),
    );
  });

  it('notifications: read ones after 7 days, unread ones after 30', async () => {
    const n = (readAt: Date | null, createdAt: Date) =>
      db.notification.create({
        data: { userId: author, actorId: other, type: 'FRIEND_ACCEPTED', readAt, createdAt },
      });
    await n(ago(8), ago(9)); // read 8 days ago: gone
    await n(ago(6), ago(20)); // read 6 days ago: kept
    await n(null, ago(31)); // unread, 31 days: gone
    await n(null, ago(29)); // unread, 29 days: kept
    expect((await runRetention(NOW)).notificationsDeleted).toBe(2);
    expect(await db.notification.count()).toBe(2);
  });

  it('author-deleted posts go after 30 days, moderator-removed after a year, with their comments and votes', async () => {
    const gone = await post('DELETED', 31);
    const young = await post('DELETED', 29);
    const removedRecent = await post('REMOVED', 200);
    const removedOld = await post('REMOVED', 366);
    const visible = await post('VISIBLE', null);
    const c = await comment(gone, 'VISIBLE', null);
    await db.vote.create({ data: { voterId: other, generalPostId: gone, value: 1 } });

    const r = await runRetention(NOW);
    expect(r.postsDeleted).toBe(2);
    expect(await exists('generalPost', gone)).toBe(false);
    expect(await exists('generalPost', removedOld)).toBe(false);
    for (const kept of [young, removedRecent, visible])
      expect(await exists('generalPost', kept)).toBe(true);
    expect(await exists('comment', c)).toBe(false);
    expect(await db.vote.count()).toBe(0);
  });

  // 🔒 Never while a report is open: on the post, on one of its comments, or on its photo.
  it('keeps content that has an open report on it (or on its comments or photos)', async () => {
    const reported = await post('DELETED', 60);
    await openReport({ generalPostId: reported });
    const commentReported = await post('DELETED', 60);
    const c = await comment(commentReported, 'VISIBLE', null);
    await openReport({ commentId: c });
    const photoReported = await post('DELETED', 60);
    const ph = await db.photo.create({
      data: { uploaderId: author, generalPostId: photoReported, status: 'ACTIVE' },
    });
    await openReport({ photoId: ph.id });
    const closed = await post('DELETED', 60);
    await db.report.create({
      data: { reporterUserId: other, reason: 'SPAM', generalPostId: closed, status: 'DISMISSED' },
    });

    expect((await runRetention(NOW)).postsDeleted).toBe(1); // only the closed-report one
    expect(await exists('generalPost', closed)).toBe(false);
    for (const p of [reported, commentReported, photoReported])
      expect(await exists('generalPost', p)).toBe(true);
    // Once the report is handled, the next run deletes it.
    await db.report.updateMany({ data: { status: 'DISMISSED' } });
    expect((await runRetention(NOW)).postsDeleted).toBe(3);
  });

  it('a deleted comment with replies is blanked (replies survive); without replies it is deleted', async () => {
    const p = await post('VISIBLE', null);
    const parent = await comment(p, 'DELETED', 40);
    const reply = await comment(p, 'VISIBLE', null, parent);
    const lone = await comment(p, 'DELETED', 40);
    const recent = await comment(p, 'DELETED', 10);

    let r = await runRetention(NOW);
    expect(r).toMatchObject({ commentsDeleted: 1, commentsBlanked: 1 });
    expect(await exists('comment', lone)).toBe(false);
    expect(await db.comment.findUniqueOrThrow({ where: { id: parent } })).toMatchObject({
      body: '',
      status: 'DELETED',
    });
    expect(await exists('comment', reply)).toBe(true);
    expect((await db.comment.findUniqueOrThrow({ where: { id: recent } })).body).toBe('a comment');
    // Once the reply is gone, the placeholder goes too.
    await db.comment.delete({ where: { id: reply } });
    r = await runRetention(NOW);
    expect(r.commentsDeleted).toBe(1);
    expect(await exists('comment', parent)).toBe(false);
  });

  it('unsent messages are deleted a day after unsending, unless reported', async () => {
    const [low, high] = [author, other].sort();
    const conv = await db.conversation.create({
      data: { userLowId: low!, userHighId: high!, dekWrapped: Buffer.from('k') },
    });
    const m = (unsentAt: Date | null) =>
      db.message.create({ data: { conversationId: conv.id, senderId: author, unsentAt } });
    await m(ago(2)); // gone
    await m(new Date(NOW.getTime() - 12 * 3_600_000)); // 12 h: kept
    await m(null); // never unsent: kept
    const reported = await m(ago(3));
    await openReport({ messageId: reported.id });
    expect((await runRetention(NOW)).unsentMessagesDeleted).toBe(1);
    expect(await db.message.count()).toBe(3);
  });

  it('removed or rejected media: the row and the stored file go after 30 days', async () => {
    const photo = async (status: 'REMOVED' | 'REJECTED', removedAt: Date) => {
      const key = `photos/${randomUUID()}.jpg`;
      await store.put(key, Buffer.from('x'), 'image/jpeg');
      const p = await db.photo.create({
        data: { uploaderId: author, status, removedAt, storageKey: key },
      });
      return { id: p.id, key };
    };
    const old = await photo('REMOVED', ago(31));
    const rejected = await photo('REJECTED', ago(40));
    const recent = await photo('REMOVED', ago(10));
    const reported = await photo('REMOVED', ago(60));
    await openReport({ photoId: reported.id });

    expect((await runRetention(NOW)).removedMediaDeleted).toBe(2);
    for (const gone of [old, rejected]) {
      expect(await db.photo.findUnique({ where: { id: gone.id } })).toBeNull();
      expect(store.objects.has(gone.key)).toBe(false);
    }
    for (const kept of [recent, reported]) expect(store.objects.has(kept.key)).toBe(true);
  });

  it('location flags after 3 months; unseen installations after a year (never banned or in use)', async () => {
    const flag = (createdAt: Date) =>
      db.locationFlag.create({
        data: { userId: author, kind: 'SUSPICIOUS_TRAVEL', action: 'general.post', createdAt },
      });
    await flag(ago(91));
    await flag(ago(89));
    const inst = (lastSeenAt: Date, bannedAt: Date | null = null) =>
      db.installation.create({
        data: { tokenHash: randomUUID().replace(/-/g, '').padEnd(64, '0'), lastSeenAt, bannedAt },
      });
    const stale = await inst(ago(400));
    await inst(ago(400), ago(500)); // banned: kept so the ban keeps working
    await inst(ago(100)); // seen recently
    const guest = await createTestGuest(ago(-1)); // its installation is still in use
    await db.installation.update({
      where: { id: guest.installationId },
      data: { lastSeenAt: ago(400) },
    });

    const r = await runRetention(NOW);
    expect(r.locationFlagsDeleted).toBe(1);
    expect(r.installationsDeleted).toBe(1);
    expect(await db.installation.findUnique({ where: { id: stale.id } })).toBeNull();
    expect(await db.installation.count()).toBe(3);
  });

  it('resolved contact tickets after 2 years; open ones stay', async () => {
    const t = (status: 'OPEN' | 'RESOLVED', resolvedAt: Date | null) =>
      db.contactMessage.create({
        data: { userId: author, category: 'GENERAL', subject: 's', body: 'b', status, resolvedAt },
      });
    await t('RESOLVED', ago(731));
    await t('RESOLVED', ago(700));
    await t('OPEN', null);
    expect((await runRetention(NOW)).contactMessagesDeleted).toBe(1);
    expect(await db.contactMessage.count()).toBe(2);
  });
});
