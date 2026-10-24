import { medalKeysSql } from '../achievements';
import { COMMENT_MAX, type CommentView, type DiscussionKind, type MedalBadge } from '@jax/shared';
import { Prisma } from '@/generated/prisma/client';
import { getConfig } from '../config';
import { db } from '../db';
import { ApiError } from '../http';
import { TABLE } from './posts';

/** P3.3: threaded comments, depth-limited, on either post type. */

const POST_COLUMN = {
  general: Prisma.raw('"generalPostId"'),
  business: Prisma.raw('"businessPostId"'),
} as const;

interface CommentRow {
  id: string;
  parentCommentId: string | null;
  depth: number;
  body: string;
  status: string;
  createdAt: Date;
  editedAt: Date | null;
  authorKind: string;
  authorUserId: string | null;
  authorGuestId: string | null;
  username: string | null;
  author_status: string | null;
  medals: MedalBadge[] | null;
  score: number;
  my_vote: number | null;
}

function toView(r: CommentRow, viewer: CommentViewer): CommentView {
  const status =
    r.status === 'VISIBLE' ? 'visible' : r.status === 'DELETED' ? 'deleted' : 'removed';
  return {
    id: r.id,
    parentCommentId: r.parentCommentId,
    depth: r.depth,
    body: status === 'visible' ? r.body : null,
    status,
    createdAt: r.createdAt.toISOString(),
    editedAt: r.editedAt?.toISOString() ?? null,
    // Guests show only the GUEST label, never an internal ID (§5).
    author:
      r.authorKind === 'GUEST'
        ? { guest: true }
        : r.author_status === 'DELETED' || !r.username
          ? { deleted: true }
          : { username: r.username, medals: r.medals ?? [] },
    score: r.score,
    myVote: (r.my_vote ?? 0) as -1 | 0 | 1,
    isMine:
      (viewer.userId !== null && r.authorUserId === viewer.userId) ||
      (viewer.guestId !== null && r.authorGuestId === viewer.guestId),
  };
}

/**
 * All comments of a post in thread order (each reply right after its parent, oldest
 * first). Deleted/removed comments stay as placeholders so replies keep their context;
 * held-for-review ones are left out.
 */
/** Who is reading: a registered user or a guest (guests never vote or block, P4.2). */
export interface CommentViewer {
  userId: string | null;
  guestId: string | null;
}

/** Matches no row: used where a guest has no user ID (votes, blocks). */
export const NO_USER = '00000000-0000-0000-0000-000000000000';

export async function listComments(kind: DiscussionKind, postId: string, viewer: CommentViewer) {
  const viewerId = viewer.userId ?? NO_USER;
  const max = await getConfig('comments.maxPerPost');
  const rows = await db.$queryRaw<CommentRow[]>`
    WITH RECURSIVE thread AS (
      SELECT c.*, ARRAY[to_char(c."createdAt", 'YYYYMMDDHH24MISSUS') || c.id::text] AS path
      FROM "Comment" c
      WHERE c.${POST_COLUMN[kind]} = ${postId}::uuid AND c."parentCommentId" IS NULL
        AND c.status <> 'HELD_FOR_REVIEW'
      UNION ALL
      SELECT c.*, t.path || (to_char(c."createdAt", 'YYYYMMDDHH24MISSUS') || c.id::text)
      FROM "Comment" c JOIN thread t ON c."parentCommentId" = t.id
      WHERE c.status <> 'HELD_FOR_REVIEW'
    )
    SELECT t.id, t."parentCommentId", t.depth, t.body, t.status::text, t."createdAt", t."editedAt",
           t."authorKind"::text AS "authorKind", t."authorUserId", t."authorGuestId", u.username,
           u.status::text AS author_status, t.score, v.value AS my_vote,
           ${medalKeysSql(Prisma.sql`t."authorUserId"`)} AS medals
    FROM thread t
    LEFT JOIN "User" u ON u.id = t."authorUserId"
    LEFT JOIN "Vote" v ON v."commentId" = t.id AND v."voterId" = ${viewerId}::uuid
    WHERE NOT EXISTS (
      SELECT 1 FROM "UserBlock" b
      WHERE (b."blockerId" = ${viewerId}::uuid AND b."blockedId" = t."authorUserId")
         OR (b."blockerId" = t."authorUserId" AND b."blockedId" = ${viewerId}::uuid))
    ORDER BY t.path
    LIMIT ${max}`;
  return rows.map((r) => toView(r, viewer));
}

/** D105: does the text already start by tagging this person? */
function startsWithTag(body: string, username: string) {
  const m = /^@([A-Za-z0-9_]+)/.exec(body);
  return !!m && m[1]!.toLowerCase() === username.toLowerCase();
}

/**
 * Adds a comment (or reply) and bumps the post's comment count in one transaction.
 * A reply's parent must be a visible comment on the same post. D105: replies go one level
 * deep (post → comment → reply); a reply to a reply goes under the same comment, starting
 * with "@name" for the person answered (a tag only: nobody is notified). A post takes at
 * most `comments.limitPerPost` comments, replies included.
 */
export async function createComment(opts: {
  kind: DiscussionKind;
  postId: string;
  /** Guests may comment on general posts only (P4.2); the caller enforces that. */
  author: { kind: 'USER'; userId: string } | { kind: 'GUEST'; guestId: string };
  body: string;
  parentCommentId?: string;
  /** P5.4: stored hidden (and not counted) until a moderator reviews it. */
  held?: boolean;
}): Promise<string> {
  const [maxDepth, limit] = await Promise.all([
    getConfig('comments.maxDepth'),
    getConfig('comments.limitPerPost'),
  ]);
  return db.$transaction(async (tx) => {
    // Lock the post row so two people can't both add the last allowed comment.
    const [post] = await tx.$queryRaw<{ commentCount: number }[]>`
      SELECT "commentCount" FROM ${TABLE[opts.kind]}
      WHERE id = ${opts.postId}::uuid AND status = 'VISIBLE' FOR UPDATE`;
    if (!post) throw new ApiError(404, 'NOT_FOUND', 'Post not found');
    if (post.commentCount >= limit) {
      throw new ApiError(
        409,
        'COMMENTS_LOCKED',
        `This post has reached ${limit} comments, so it’s closed to new ones.`,
      );
    }
    let depth = 0;
    let parentId: string | null = null;
    let body = opts.body;
    if (opts.parentCommentId) {
      const select = {
        generalPostId: true,
        businessPostId: true,
        parentCommentId: true,
        depth: true,
        status: true,
        authorUserId: true,
        authorUser: { select: { username: true, status: true } },
      } as const;
      const parent = await tx.comment.findUnique({ where: { id: opts.parentCommentId }, select });
      const parentPost = opts.kind === 'general' ? parent?.generalPostId : parent?.businessPostId;
      if (!parent || parentPost !== opts.postId || parent.status !== 'VISIBLE') {
        throw new ApiError(400, 'INVALID_PARENT', 'You can only reply to a comment on this post');
      }
      // Answering a reply: attach to the comment it hangs under (older threads may be deeper).
      let anchor: { id: string; depth: number } = { id: opts.parentCommentId, depth: parent.depth };
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
        throw new ApiError(400, 'MAX_DEPTH', 'Replies can’t go any deeper here');
      }
      const answered = parent.authorUser;
      const self = opts.author.kind === 'USER' && parent.authorUserId === opts.author.userId;
      if (
        anchor.id !== opts.parentCommentId &&
        answered &&
        answered.status !== 'DELETED' &&
        !self &&
        !startsWithTag(body, answered.username)
      ) {
        body = `@${answered.username} ${body}`;
        if (body.length > COMMENT_MAX) {
          throw new ApiError(
            400,
            'VALIDATION_ERROR',
            `Keep it under ${COMMENT_MAX} characters (the @name counts)`,
          );
        }
      }
      parentId = anchor.id;
      depth = anchor.depth + 1;
    }
    const c = await tx.comment.create({
      data: {
        ...(opts.kind === 'general'
          ? { generalPostId: opts.postId }
          : { businessPostId: opts.postId }),
        parentCommentId: parentId,
        depth,
        ...(opts.author.kind === 'USER'
          ? { authorKind: 'USER' as const, authorUserId: opts.author.userId }
          : { authorKind: 'GUEST' as const, authorGuestId: opts.author.guestId }),
        body,
        status: opts.held ? 'HELD_FOR_REVIEW' : 'VISIBLE',
      },
      select: { id: true },
    });
    if (opts.held) return c.id;
    await tx.$executeRaw`
      UPDATE ${TABLE[opts.kind]} SET "commentCount" = "commentCount" + 1 WHERE id = ${opts.postId}::uuid`;
    return c.id;
  });
}

/** The comment's post (for location checks on replies and votes). */
export async function commentPost(commentId: string) {
  const c = await db.comment.findFirst({
    where: { id: commentId, status: 'VISIBLE' },
    select: { generalPostId: true, businessPostId: true, authorUserId: true },
  });
  if (!c) throw new ApiError(404, 'NOT_FOUND', 'Comment not found');
  return c.generalPostId
    ? { kind: 'general' as const, postId: c.generalPostId }
    : { kind: 'business' as const, postId: c.businessPostId! };
}

/** P3.8: authors edit their own visible comments. */
export async function editComment(id: string, userId: string, body: string) {
  const res = await db.comment.updateMany({
    where: { id, authorUserId: userId, status: 'VISIBLE' },
    data: { body, editedAt: new Date() },
  });
  if (res.count !== 1) throw new ApiError(404, 'NOT_FOUND', 'Comment not found');
}

/** P3.8: soft delete; the post's comment count goes down with it. */
export async function deleteComment(id: string, userId: string) {
  await db.$transaction(async (tx) => {
    const c = await tx.comment.findFirst({
      where: { id, authorUserId: userId, status: 'VISIBLE' },
      select: { generalPostId: true, businessPostId: true },
    });
    if (!c) throw new ApiError(404, 'NOT_FOUND', 'Comment not found');
    await tx.comment.update({ where: { id }, data: { status: 'DELETED' } });
    const kind: DiscussionKind = c.generalPostId ? 'general' : 'business';
    await tx.$executeRaw`
      UPDATE ${TABLE[kind]} SET "commentCount" = GREATEST("commentCount" - 1, 0)
      WHERE id = ${(c.generalPostId ?? c.businessPostId)!}::uuid`;
  });
}
