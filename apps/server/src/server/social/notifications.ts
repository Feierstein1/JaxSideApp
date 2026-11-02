import {
  MENTION_NOTIFY_MAX,
  mentionedUsernames,
  type DiscussionKind,
  type NotificationView,
} from '@jax/shared';
import { Prisma, type NotificationType } from '@/generated/prisma/client';
import { getConfig } from '../config';
import { db } from '../db';
import { nearestNeighborhood } from '../location/neighborhood';
import { logger } from '../logger';
import { signedPhotoUrl } from '../media/photos';

/**
 * D76: the in-app bell. Rows are small (type + who caused it) and indexed by recipient,
 * so the unread count the app polls is one index lookup. Live updates (WebSockets) and
 * phone push can be added on top later without changing this table.
 */

const LIST_SIZE = 50;
/** D107: the bell shows what retention keeps (old ones are deleted by jobs/retention.ts). */
const windowStart = async () =>
  new Date(Date.now() - (await getConfig('retention.notificationUnreadDays')) * 86_400_000);

export async function notify(
  tx: Prisma.TransactionClient,
  userId: string,
  type: NotificationType,
  actorId: string,
) {
  await tx.notification.create({ data: { userId, type, actorId } });
}

/**
 * Notifications whose sender still has an active account, or (D172) that came from a
 * business on the business website (shown as "The Owner"; a revoked login stops them).
 */
const FROM_LIVE_ACTOR = {
  OR: [
    { actor: { status: 'ACTIVE' as const } },
    { actorBusinessId: { not: null }, actorBusiness: { revokedAt: null } },
  ],
};

export async function unreadCount(userId: string): Promise<number> {
  return db.notification.count({
    where: {
      userId,
      readAt: null,
      ...FROM_LIVE_ACTOR,
      createdAt: { gt: await windowStart() },
    },
  });
}

// ───────────── D156: comments, replies and @mentions ─────────────

type Activity = 'POST_COMMENT' | 'COMMENT_REPLY' | 'MENTION';
const postColumn = (kind: DiscussionKind) =>
  kind === 'general' ? ('generalPostId' as const) : ('businessPostId' as const);

/** Accounts that blocked the author, or that the author blocked (neither hears from the other). */
async function blockedWith(authorId: string, userIds: string[]) {
  if (!userIds.length) return new Set<string>();
  const rows = await db.userBlock.findMany({
    where: {
      OR: [
        { blockerId: authorId, blockedId: { in: userIds } },
        { blockedId: authorId, blockerId: { in: userIds } },
      ],
    },
    select: { blockerId: true, blockedId: true },
  });
  return new Set(rows.map((r) => (r.blockerId === authorId ? r.blockedId : r.blockerId)));
}

/** Active accounts named with @ in the text (the first MENTION_NOTIFY_MAX names only). */
async function mentionedIds(body: string) {
  const names = mentionedUsernames(body).slice(0, MENTION_NOTIFY_MAX);
  if (!names.length) return [];
  const users = await db.user.findMany({
    where: { usernameNormalized: { in: names }, status: 'ACTIVE' },
    select: { id: true },
  });
  return users.map((u) => u.id);
}

/**
 * Sends one notification per person for one new post or comment: a reply to your comment
 * comes first, then being @mentioned, then a comment on your post (so the post's author who
 * is also mentioned gets one, not two). Never to the author, and never across a block.
 * Unread comments on the same post are combined into one row with a count.
 */
async function send(opts: {
  kind: DiscussionKind;
  postId: string;
  commentId: string | null;
  authorId: string;
  recipients: [string, Activity][];
}) {
  const chosen = new Map<string, Activity>();
  for (const [userId, type] of opts.recipients) {
    if (userId !== opts.authorId && !chosen.has(userId)) chosen.set(userId, type);
  }
  const blocked = await blockedWith(opts.authorId, [...chosen.keys()]);
  const column = postColumn(opts.kind);
  for (const [userId, type] of chosen) {
    if (blocked.has(userId)) continue;
    if (type === 'POST_COMMENT') {
      const unread = await db.notification.findFirst({
        where: { userId, type, [column]: opts.postId, readAt: null },
        select: { id: true },
      });
      if (unread) {
        await db.notification.update({
          where: { id: unread.id },
          data: {
            count: { increment: 1 },
            actorId: opts.authorId,
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
        actorId: opts.authorId,
        [column]: opts.postId,
        commentId: opts.commentId,
      },
    });
  }
}

/** D156: after a visible comment: the post's author, the replied-to author, @mentions. */
export async function notifyComment(opts: {
  kind: DiscussionKind;
  postId: string;
  commentId: string;
  authorId: string;
  parentCommentId?: string;
  body: string;
}) {
  try {
    const post =
      opts.kind === 'general'
        ? await db.generalPost.findUnique({
            where: { id: opts.postId },
            select: { authorId: true },
          })
        : await db.businessPost.findUnique({
            where: { id: opts.postId },
            select: { authorId: true },
          });
    const parent = opts.parentCommentId
      ? await db.comment.findUnique({
          where: { id: opts.parentCommentId },
          select: { authorUserId: true },
        })
      : null;
    const recipients: [string, Activity][] = [];
    if (parent?.authorUserId) recipients.push([parent.authorUserId, 'COMMENT_REPLY']);
    for (const id of await mentionedIds(opts.body)) recipients.push([id, 'MENTION']);
    // D172: a post by the place's business has no app user to notify (its own inbox, B1.8).
    if (post?.authorId) recipients.push([post.authorId, 'POST_COMMENT']);
    await send({ ...opts, recipients });
  } catch (err) {
    // A notification must never fail the comment itself.
    logger.warn({ err }, 'comment notifications not sent');
  }
}

/** D156: after a visible post: whoever it @mentions. */
export async function notifyPostMentions(opts: {
  kind: DiscussionKind;
  postId: string;
  authorId: string;
  body: string;
}) {
  try {
    const ids = await mentionedIds(opts.body);
    const recipients = ids.map((id) => [id, 'MENTION'] as [string, Activity]);
    if (recipients.length) await send({ ...opts, commentId: null, recipients });
  } catch (err) {
    logger.warn({ err }, 'mention notifications not sent');
  }
}

/** D157: notifications caused by a place's verified owner on one of that place's posts. */
async function ownerActors(
  rows: { id: string; actorId: string | null; businessPostId: string | null }[],
) {
  const candidates = rows.filter((r) => r.actorId && r.businessPostId);
  if (!candidates.length) return new Set<string>();
  const hits = await db.$queryRaw<{ id: string }[]>`
    SELECT n.id FROM "Notification" n
    JOIN "BusinessPost" bp ON bp.id = n."businessPostId"
    JOIN "OwnerClaim" oc ON oc."placeId" = bp."placeId" AND oc."userId" = n."actorId"
                        AND oc.status = 'VERIFIED'
    WHERE n.id IN (${Prisma.join(candidates.map((r) => Prisma.sql`${r.id}::uuid`))})`;
  return new Set(hits.map((h) => h.id));
}

/** Where a post is, for "near Riverside": the area, the place, or the citywide topic. */
async function placesFor(rows: { generalPostId: string | null; businessPostId: string | null }[]) {
  const general = rows.flatMap((r) => (r.generalPostId ? [r.generalPostId] : []));
  const business = rows.flatMap((r) => (r.businessPostId ? [r.businessPostId] : []));
  const where = new Map<string, string | null>();
  if (general.length) {
    const g = await db.$queryRaw<
      { id: string; latitude: number | null; longitude: number | null; topic: string | null }[]
    >`
      SELECT p.id, ST_Y(p.location::geometry) AS latitude, ST_X(p.location::geometry) AS longitude,
             t.title AS topic
      FROM "GeneralPost" p LEFT JOIN "CityTopic" t ON t.id = p."topicId"
      WHERE p.id IN (${Prisma.join(general.map((id) => Prisma.sql`${id}::uuid`))})`;
    for (const r of g) {
      const area =
        r.latitude !== null && r.longitude !== null
          ? nearestNeighborhood({ latitude: r.latitude, longitude: r.longitude })
          : null;
      where.set(r.id, r.topic ?? area);
    }
  }
  if (business.length) {
    const b = await db.businessPost.findMany({
      where: { id: { in: business } },
      select: { id: true, place: { select: { name: true } } },
    });
    for (const r of b) where.set(r.id, r.place.name);
  }
  return where;
}

export async function listNotifications(userId: string): Promise<NotificationView[]> {
  const rows = await db.notification.findMany({
    where: {
      userId,
      ...FROM_LIVE_ACTOR,
      createdAt: { gt: await windowStart() },
    },
    orderBy: { createdAt: 'desc' },
    take: LIST_SIZE,
    include: {
      actor: {
        select: { id: true, username: true, profile: true },
      },
    },
  });
  // Requests still waiting can be answered right from the bell.
  const pending = await db.friendship.findMany({
    where: {
      status: 'PENDING',
      requesterId: { in: rows.filter((r) => r.type === 'FRIEND_REQUEST').map((r) => r.actorId!) },
      OR: [{ userLowId: userId }, { userHighId: userId }],
    },
    select: { id: true, requesterId: true },
  });
  const pendingBy = new Map(pending.map((p) => [p.requesterId, p.id]));
  const where = await placesFor(rows);
  const owners = await ownerActors(rows);
  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    // D157: an owner acting in their own place is "The Owner", never their username;
    // D172: so is the place's business answering from the business website.
    actorIsOwner: owners.has(r.id) || r.actorBusinessId !== null,
    actor: owners.has(r.id) || r.actorBusinessId !== null
      ? null
      : r.actor
        ? {
            username: r.actor.username,
            color: r.actor.profile?.color ?? 'teal',
            avatarUrl: r.actor.profile?.avatarPhotoId
              ? signedPhotoUrl(r.actor.profile.avatarPhotoId)
              : null,
          }
        : null,
    pendingRequestId:
      r.type === 'FRIEND_REQUEST' && r.actorId ? (pendingBy.get(r.actorId) ?? null) : null,
    target: postTarget(r),
    where: where.get(r.generalPostId ?? r.businessPostId ?? '') ?? null,
    count: r.count,
    createdAt: r.createdAt.toISOString(),
    read: r.readAt !== null,
  }));
}

export async function markAllRead(userId: string) {
  await db.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}

/** The post (and comment) a notification opens. */
function postTarget(r: {
  generalPostId: string | null;
  businessPostId: string | null;
  commentId: string | null;
}): NotificationView['target'] {
  if (r.generalPostId) return { kind: 'general', postId: r.generalPostId, commentId: r.commentId };
  if (r.businessPostId) {
    return { kind: 'business', postId: r.businessPostId, commentId: r.commentId };
  }
  return null;
}
