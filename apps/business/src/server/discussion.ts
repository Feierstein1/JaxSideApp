import type {
  BusinessAccount,
  NotificationType,
  Prisma,
  ReportReason,
  ScreeningCategory,
} from '@/generated/prisma/client';
import { getConfig } from './config';
import { db } from './db';
import { ApiError } from './http';
import { requirePlace, type PlaceView } from './places';
import { enforce } from './rate-limit';
import { screenText } from './screening';

/**
 * B1.6 / D172: the place's discussion on the business website. Anyone on the place's
 * team reads it and writes from anywhere (a deliberate exception to "must be near"; only
 * members of that place, only that place). What they write shows as "The Owner" (plus
 * the optional staff name); which login wrote it is recorded, and only the Owner sees it.
 * Moderation is the app's: the same screening rules, held items go to the same queue.
 */

const PAGE = 20;
const notFound = () => new ApiError(404, 'NOT_FOUND', 'Not found.');

export const DISCUSSION_LIMITS = {
  post: { limit: 20, windowSeconds: 3600 },
  reply: { limit: 120, windowSeconds: 3600 },
} as const;

/** How an author looks here: the public view, plus (Owner only) which login wrote it. */
export type AuthorView =
  | { username: string }
  | { deleted: true }
  | { guest: true }
  | { theOwner: true; staffName: string | null; writtenBy?: string };

export type PostItem = {
  id: string;
  body: string;
  createdAt: string;
  commentCount: number;
  score: number;
  author: AuthorView;
  /** Held for a moderator (only ever the business's own posts are listed in this state). */
  held: boolean;
  /** The business wrote it, so the site can offer to remove it. */
  ours: boolean;
};

export type CommentItem = {
  id: string;
  parentCommentId: string | null;
  depth: number;
  body: string | null;
  status: 'visible' | 'deleted' | 'removed' | 'held';
  createdAt: string;
  author: AuthorView;
  ours: boolean;
};

/** Staff names and logins of the business's people at this place. */
async function teamNames(placeId: string) {
  const rows = await db.businessPlaceAccess.findMany({
    where: { placeId },
    orderBy: { createdAt: 'asc' },
    select: {
      accountId: true,
      staffName: true,
      account: { select: { username: true, email: true } },
    },
  });
  const byId = new Map<string, { staffName: string | null; login: string }>();
  for (const r of rows) {
    byId.set(r.accountId, {
      staffName: r.staffName,
      login: r.account.username ?? r.account.email ?? '',
    });
  }
  return byId;
}

/** D157: phone-app users who are this place's verified owners also show as "The Owner". */
async function verifiedOwnerUsers(placeId: string) {
  const claims = await db.ownerClaim.findMany({
    where: { placeId, status: 'VERIFIED' },
    select: { userId: true, staffName: true },
  });
  return new Map(claims.map((c) => [c.userId, c.staffName]));
}

type Names = Awaited<ReturnType<typeof teamNames>>;
type Owners = Awaited<ReturnType<typeof verifiedOwnerUsers>>;

function authorView(
  a: {
    businessAccountId: string | null;
    user: { id: string; username: string; status: string } | null;
    guest?: boolean;
  },
  names: Names,
  owners: Owners,
  place: PlaceView,
): AuthorView {
  if (a.businessAccountId) {
    const who = names.get(a.businessAccountId);
    return {
      theOwner: true,
      staffName: who?.staffName ?? null,
      // Only the Owner learns which login wrote it (D172).
      ...(place.role === 'OWNER' ? { writtenBy: who?.login ?? '' } : {}),
    };
  }
  if (a.guest) return { guest: true };
  if (!a.user || a.user.status === 'DELETED') return { deleted: true };
  if (owners.has(a.user.id)) return { theOwner: true, staffName: owners.get(a.user.id) ?? null };
  return { username: a.user.username };
}

const userSelect = { select: { id: true, username: true, status: true } } as const;

/** The place's posts, newest first: everyone's visible ones, plus the business's held ones. */
export async function listPosts(
  account: BusinessAccount,
  placeId: string,
  before?: string,
): Promise<{ place: PlaceView; posts: PostItem[]; nextBefore: string | null }> {
  const place = await requirePlace(account.id, placeId, 'discussion');
  const cursor = before ? new Date(before) : null;
  if (cursor && Number.isNaN(cursor.getTime())) throw new ApiError(400, 'VALIDATION', 'Bad page.');
  const rows = await db.businessPost.findMany({
    where: {
      placeId,
      OR: [{ status: 'VISIBLE' }, { status: 'HELD_FOR_REVIEW', businessAuthorId: { not: null } }],
      ...(cursor ? { createdAt: { lt: cursor } } : {}),
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: PAGE + 1,
    include: { author: userSelect },
  });
  const [names, owners] = await Promise.all([teamNames(placeId), verifiedOwnerUsers(placeId)]);
  const items = rows.slice(0, PAGE);
  return {
    place,
    posts: items.map((p) => ({
      id: p.id,
      body: p.body,
      createdAt: p.createdAt.toISOString(),
      commentCount: p.commentCount,
      score: p.score,
      author: authorView(
        { businessAccountId: p.businessAuthorId, user: p.author },
        names,
        owners,
        place,
      ),
      held: p.status === 'HELD_FOR_REVIEW',
      ours: p.businessAuthorId !== null,
    })),
    nextBefore: rows.length > PAGE ? items[items.length - 1]!.createdAt.toISOString() : null,
  };
}

/** One post of this place and its comments in thread order. */
export async function getThread(account: BusinessAccount, placeId: string, postId: string) {
  const place = await requirePlace(account.id, placeId, 'discussion');
  if (!/^[0-9a-f-]{36}$/i.test(postId)) throw notFound();
  const post = await db.businessPost.findFirst({
    where: {
      id: postId,
      placeId,
      OR: [{ status: 'VISIBLE' }, { status: 'HELD_FOR_REVIEW', businessAuthorId: { not: null } }],
    },
    include: { author: userSelect },
  });
  if (!post) throw notFound();
  const max = await getConfig('comments.maxPerPost');
  const comments = await db.comment.findMany({
    where: {
      businessPostId: postId,
      OR: [
        { status: { in: ['VISIBLE', 'DELETED', 'REMOVED'] } },
        { status: 'HELD_FOR_REVIEW', authorKind: 'BUSINESS' },
      ],
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: max,
    include: { authorUser: userSelect },
  });
  const [names, owners] = await Promise.all([teamNames(placeId), verifiedOwnerUsers(placeId)]);

  // Thread order: each reply right after the comment it answers.
  const children = new Map<string | null, typeof comments>();
  for (const c of comments) {
    const key = c.parentCommentId;
    children.set(key, [...(children.get(key) ?? []), c]);
  }
  const ordered: typeof comments = [];
  const walk = (parent: string | null) => {
    for (const c of children.get(parent) ?? []) {
      ordered.push(c);
      walk(c.id);
    }
  };
  walk(null);

  const toItem = (c: (typeof comments)[number]): CommentItem => {
    const status =
      c.status === 'VISIBLE'
        ? 'visible'
        : c.status === 'DELETED'
          ? 'deleted'
          : c.status === 'HELD_FOR_REVIEW'
            ? 'held'
            : 'removed';
    return {
      id: c.id,
      parentCommentId: c.parentCommentId,
      depth: c.depth,
      body: status === 'visible' || status === 'held' ? c.body : null,
      status,
      createdAt: c.createdAt.toISOString(),
      author: authorView(
        {
          businessAccountId: c.authorBusinessId,
          user: c.authorUser,
          guest: c.authorKind === 'GUEST',
        },
        names,
        owners,
        place,
      ),
      ours: c.authorKind === 'BUSINESS',
    };
  };

  return {
    place,
    post: {
      id: post.id,
      body: post.body,
      createdAt: post.createdAt.toISOString(),
      commentCount: post.commentCount,
      score: post.score,
      author: authorView(
        { businessAccountId: post.businessAuthorId, user: post.author },
        names,
        owners,
        place,
      ),
      held: post.status === 'HELD_FOR_REVIEW',
      ours: post.businessAuthorId !== null,
    } satisfies PostItem,
    comments: ordered.map(toItem),
    commentsLocked: post.commentCount >= (await getConfig('comments.limitPerPost')),
  };
}

// ───────────────────────────── Writing ─────────────────────────────

/** Screening category → report reason, like the app's automatic reports on held content. */
const REPORT_REASON_FOR: Record<ScreeningCategory, ReportReason> = {
  SLUR: 'HATE',
  THREAT: 'THREAT',
  SEXUAL: 'SEXUAL_CONTENT',
  HARASSMENT: 'HARASSMENT',
  DOXXING: 'DOXXING',
  SPAM: 'SPAM',
  OTHER: 'OTHER',
};

async function screen(body: string, confirmWarning?: true) {
  const result = await screenText(body, 'new-content', { confirmWarning });
  if (!result.held) return null;
  return {
    reason: REPORT_REASON_FOR[result.rule.category],
    details: `Held by automatic screening (${result.rule.category.toLowerCase()} rule ${result.rule.id}); written on the business website.`,
  };
}

/** A new post as "The Owner". Held ones wait for a moderator (and aren't counted yet). */
export async function createPost(
  account: BusinessAccount,
  placeId: string,
  input: { body: string; confirmWarning?: true },
  now = new Date(),
): Promise<{ id: string; held: boolean }> {
  await requirePlace(account.id, placeId, 'discussion');
  await enforce([{ key: `post:acct:${account.id}`, ...DISCUSSION_LIMITS.post }], now);
  const hold = await screen(input.body, input.confirmWarning);
  const id = await db.$transaction(async (tx) => {
    const post = await tx.businessPost.create({
      data: {
        placeId,
        businessAuthorId: account.id,
        body: input.body,
        status: hold ? 'HELD_FOR_REVIEW' : 'VISIBLE',
      },
      select: { id: true },
    });
    if (hold) {
      // The app's moderation queue: a report with no reporter.
      await tx.report.create({ data: { businessPostId: post.id, ...hold } });
    } else {
      await tx.businessPlace.update({
        where: { id: placeId },
        data: { postCount: { increment: 1 } },
      });
    }
    return post.id;
  });
  return { id, held: !!hold };
}

/** A post of this place that's open to replies, locked for the count check. */
async function lockPost(tx: Prisma.TransactionClient, placeId: string, postId: string) {
  const [post] = await tx.$queryRaw<{ commentCount: number; authorId: string | null }[]>`
    SELECT "commentCount", "authorId" FROM "BusinessPost"
    WHERE id = ${postId}::uuid AND "placeId" = ${placeId}::uuid AND status = 'VISIBLE'
    FOR UPDATE`;
  if (!post) throw notFound();
  return post;
}

/** A reply as "The Owner" (on the post, or under a comment on it). */
export async function createReply(
  account: BusinessAccount,
  placeId: string,
  postId: string,
  input: { body: string; parentCommentId?: string; confirmWarning?: true },
  now = new Date(),
): Promise<{ id: string; held: boolean }> {
  await requirePlace(account.id, placeId, 'discussion');
  if (!/^[0-9a-f-]{36}$/i.test(postId)) throw notFound();
  await enforce([{ key: `reply:acct:${account.id}`, ...DISCUSSION_LIMITS.reply }], now);
  const hold = await screen(input.body, input.confirmWarning);
  const [maxDepth, limit] = await Promise.all([
    getConfig('comments.maxDepth'),
    getConfig('comments.limitPerPost'),
  ]);

  const result = await db.$transaction(async (tx) => {
    const post = await lockPost(tx, placeId, postId);
    if (post.commentCount >= limit) {
      throw new ApiError(
        409,
        'COMMENTS_LOCKED',
        `This post has reached ${limit} comments, so it’s closed to new ones.`,
      );
    }
    let depth = 0;
    let parentId: string | null = null;
    let answeredUserId: string | null = null;
    if (input.parentCommentId) {
      const parent = await tx.comment.findUnique({
        where: { id: input.parentCommentId },
        select: {
          businessPostId: true,
          depth: true,
          parentCommentId: true,
          status: true,
          authorUserId: true,
        },
      });
      if (!parent || parent.businessPostId !== postId || parent.status !== 'VISIBLE') {
        throw new ApiError(400, 'INVALID_PARENT', 'You can only reply to a comment on this post.');
      }
      // Like the app: a reply to a reply hangs under the comment it answers, within the depth.
      let anchor = { id: input.parentCommentId, depth: parent.depth };
      let up = parent.parentCommentId;
      while (anchor.depth >= Math.max(maxDepth, 1) && up) {
        const p = await tx.comment.findUnique({
          where: { id: up },
          select: { id: true, depth: true, parentCommentId: true },
        });
        if (!p) break;
        anchor = { id: p.id, depth: p.depth };
        up = p.parentCommentId;
      }
      if (anchor.depth + 1 > maxDepth) {
        throw new ApiError(400, 'MAX_DEPTH', 'Replies can’t go any deeper here.');
      }
      parentId = anchor.id;
      depth = anchor.depth + 1;
      answeredUserId = parent.authorUserId;
    }
    const c = await tx.comment.create({
      data: {
        businessPostId: postId,
        parentCommentId: parentId,
        depth,
        authorKind: 'BUSINESS',
        authorBusinessId: account.id,
        body: input.body,
        status: hold ? 'HELD_FOR_REVIEW' : 'VISIBLE',
      },
      select: { id: true },
    });
    if (hold) {
      await tx.report.create({ data: { commentId: c.id, ...hold } });
    } else {
      await tx.businessPost.update({
        where: { id: postId },
        data: { commentCount: { increment: 1 } },
      });
    }
    return { id: c.id, postAuthorId: post.authorId, answeredUserId };
  });

  if (!hold) {
    await notifyPeople({
      accountId: account.id,
      postId,
      commentId: result.id,
      postAuthorId: result.postAuthorId,
      answeredUserId: result.answeredUserId,
    });
  }
  return { id: result.id, held: !!hold };
}

/**
 * The app's bell (D156) for the people answered: the person replied to and the post's
 * author, shown as "The Owner" (D172). Unread post comments on one post stay one row.
 * A failure here never fails the reply.
 */
async function notifyPeople(opts: {
  accountId: string;
  postId: string;
  commentId: string;
  postAuthorId: string | null;
  answeredUserId: string | null;
}) {
  try {
    const chosen = new Map<string, NotificationType>();
    if (opts.answeredUserId) chosen.set(opts.answeredUserId, 'COMMENT_REPLY');
    if (opts.postAuthorId && !chosen.has(opts.postAuthorId)) {
      chosen.set(opts.postAuthorId, 'POST_COMMENT');
    }
    for (const [userId, type] of chosen) {
      if (type === 'POST_COMMENT') {
        const unread = await db.notification.findFirst({
          where: { userId, type, businessPostId: opts.postId, readAt: null },
          select: { id: true },
        });
        if (unread) {
          await db.notification.update({
            where: { id: unread.id },
            data: {
              count: { increment: 1 },
              actorId: null,
              actorBusinessId: opts.accountId,
              commentId: opts.commentId,
              createdAt: new Date(),
            },
          });
          continue;
        }
      }
      await db.notification.create({
        data: {
          userId,
          type,
          actorBusinessId: opts.accountId,
          businessPostId: opts.postId,
          commentId: opts.commentId,
        },
      });
    }
  } catch (err) {
    console.warn('business reply notifications not sent', err);
  }
}

/**
 * Removes a post or reply the business wrote. Anyone on the team can remove what they
 * wrote; the Owner can remove anything the business wrote at this place.
 */
export async function removeOwn(
  account: BusinessAccount,
  placeId: string,
  target: { postId: string } | { commentId: string },
) {
  const place = await requirePlace(account.id, placeId, 'discussion');
  // The Owner may remove anything the business wrote here; others only their own.
  const anyByBusiness = place.role === 'OWNER';
  if ('postId' in target) {
    if (!/^[0-9a-f-]{36}$/i.test(target.postId)) throw notFound();
    await db.$transaction(async (tx) => {
      const post = await tx.businessPost.findFirst({
        where: {
          id: target.postId,
          placeId,
          status: { in: ['VISIBLE', 'HELD_FOR_REVIEW'] },
          businessAuthorId: anyByBusiness ? { not: null } : account.id,
        },
        select: { id: true, status: true },
      });
      if (!post) throw notFound();
      await tx.businessPost.update({ where: { id: post.id }, data: { status: 'DELETED' } });
      if (post.status === 'VISIBLE') {
        await tx.businessPlace.update({
          where: { id: placeId },
          data: { postCount: { decrement: 1 } },
        });
      }
    });
    return;
  }
  if (!/^[0-9a-f-]{36}$/i.test(target.commentId)) throw notFound();
  await db.$transaction(async (tx) => {
    const c = await tx.comment.findFirst({
      where: {
        id: target.commentId,
        authorKind: 'BUSINESS',
        status: { in: ['VISIBLE', 'HELD_FOR_REVIEW'] },
        businessPost: { placeId },
        ...(anyByBusiness ? {} : { authorBusinessId: account.id }),
      },
      select: { id: true, status: true, businessPostId: true },
    });
    if (!c) throw notFound();
    await tx.comment.update({ where: { id: c.id }, data: { status: 'DELETED' } });
    if (c.status === 'VISIBLE') {
      await tx.$executeRaw`
        UPDATE "BusinessPost" SET "commentCount" = GREATEST("commentCount" - 1, 0)
        WHERE id = ${c.businessPostId}::uuid`;
    }
  });
}
