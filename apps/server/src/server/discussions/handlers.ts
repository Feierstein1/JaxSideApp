/**
 * HTTP handlers shared by general posts (/posts) and business-room posts
 * (/business-posts, /places/:id/posts), so both enforce the same order (CLAUDE.md):
 * auth guard → strict schema → rate limit → location → ownership/business rules.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  createCommentSchema,
  createPostSchema,
  editCommentSchema,
  editPostSchema,
  feedRequestSchema,
  topicPostsSchema,
  listCommentsSchema,
  milesToMeters,
  voteSchema,
  type ConfigKey,
  type DiscussionKind,
  type LocationReading,
} from '@jax/shared';
import type { User } from '@/generated/prisma/client';
import { requireActor, requireUser, type Actor } from '../auth/require-actor';
import { getConfig } from '../config';
import { db } from '../db';
import { ApiError } from '../http';
import { radiusPreference } from '../profiles';
import {
  assertLocationEligible,
  coarsenPoint,
  type GeoPoint,
  type LocationAction,
  type LocationActor,
  type LocationTarget,
} from '../location/eligibility';
import { enforce } from '../rate-limit';
import { parseBody } from '../validate';
import {
  commentPost,
  createComment,
  deleteComment,
  editComment,
  listComments,
  NO_USER,
} from './comments';
import {
  createBusinessPost,
  createGeneralPost,
  deletePost,
  editPost,
  getPostView,
  listFeed,
  listPlacePosts,
  listTopicPosts,
  postAnchor,
} from './posts';
import { nearestNeighborhood } from '../location/neighborhood';
import { logger } from '../logger';
import { notePresence } from '../chat/presence';
import { recordAreaVisit } from '../stats/area-visits';
import { holdFor, holdReport, screenText, type Hold } from '../moderation/screening';
import { checkEdit, checkNewContent } from '../moderation/spam';
import { castVote } from './votes';
import { evaluateForCommentAuthor, evaluateForPostAuthor } from '../achievements';
import { assertTopicOpen, getTopic, localRadiusMeters, topicAnchor } from '../topics';
import { notifyComment, notifyPostMentions } from '../social/notifications';

export type IdCtx = { params: Promise<{ id: string }> };

export async function idFrom(ctx: IdCtx): Promise<string> {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new ApiError(404, 'NOT_FOUND', 'Not found');
  return id;
}

function limits(userId: string, ...rules: [string, ConfigKey, number][]) {
  return limitsFor(`user:${userId}`, ...rules);
}
function limitsFor(subject: string, ...rules: [string, ConfigKey, number][]) {
  return enforce(
    rules.map(([bucket, limitKey, windowSeconds]) => ({
      key: `${bucket}:${subject}`,
      limitKey,
      windowSeconds,
    })),
  );
}
const READ: [string, ConfigKey, number] = ['feed', 'rateLimit.feed.perMinute', 60];
const VERIFIED = { requireVerifiedEmail: true } as const;
const VOTE_RULES: [string, ConfigKey, number][] = [
  ['vote-burst', 'rateLimit.vote.burstPer10s', 10],
  ['vote', 'rateLimit.vote.perMinute', 60],
  ['vote-day', 'rateLimit.vote.perDay', 86_400],
];

export async function activePlacePoint(placeId: string) {
  const p = await db.businessPlace.findFirst({
    where: { id: placeId, status: 'ACTIVE' },
    select: { latitude: true, longitude: true },
  });
  if (!p) throw new ApiError(404, 'NOT_FOUND', 'Place not found');
  return p;
}

/** The location rule for acting on an existing post (D19, D20). */
async function checkPostAccess(
  actor: LocationActor,
  reading: LocationReading,
  kind: DiscussionKind,
  postId: string,
  verb: 'read' | 'comment' | 'vote',
) {
  const anchor = await postAnchor(kind, postId);
  const action = `${kind}.${verb}` as LocationAction;
  if (anchor.topicId) {
    // D125 / D133: a post in a topic. A closed topic stays readable but takes no new
    // comments or votes. A city topic needs only an in-Duval location; a local topic needs
    // the reader within half a mile of where the topic was made, for reading too.
    const topic = await topicAnchor(anchor.topicId);
    if (verb !== 'read' && !topic.open) {
      throw new ApiError(409, 'TOPIC_CLOSED', 'This topic is closed.');
    }
    return assertLocationEligible(
      actor,
      reading,
      action,
      topic.local ? { kind: 'topic', point: topic.local } : undefined,
    );
  }
  // Reading a general post only needs an in-Duval location (D16); everything else is
  // radius-bound: 1 mi of a general post (D20), 0.3 mi of a business (D19).
  const target: LocationTarget | undefined =
    kind === 'general' && verb === 'read'
      ? undefined
      : { kind, point: { latitude: anchor.latitude, longitude: anchor.longitude } };
  return assertLocationEligible(actor, reading, action, target);
}

/** D115: is this reading within the comment radius of the post? (Place posts: read = near.) */
async function withinCommentRadius(kind: DiscussionKind, id: string, reading: LocationReading) {
  if (kind === 'business') return true; // reading a place's post already needs its radius
  const anchor = await postAnchor(kind, id);
  let center = { latitude: anchor.latitude, longitude: anchor.longitude };
  let meters = milesToMeters(await getConfig('radius.general.maxMiles'));
  if (anchor.topicId) {
    // D125 / D133: while the topic is open; city topics anywhere, local ones nearby.
    const topic = await topicAnchor(anchor.topicId);
    if (!topic.open) return false;
    if (!topic.local) return true;
    center = topic.local;
    meters = await localRadiusMeters();
  }
  const [row] = await db.$queryRaw<{ within: boolean }[]>`
    SELECT ST_DWithin(
      ST_SetSRID(ST_MakePoint(${reading.longitude}, ${reading.latitude}), 4326)::geography,
      ST_SetSRID(ST_MakePoint(${center.longitude}, ${center.latitude}), 4326)::geography,
      ${meters}) AS within`;
  return !!row?.within;
}

/** Guests act through requireActor (P4.2); IDs for rate limits and viewer joins. */
export function actorKey(a: Actor) {
  return a.kind === 'user' ? `user:${a.user.id}` : `guest:${a.guest.id}`;
}
export function locationActor(a: Actor): LocationActor {
  return a.kind === 'user' ? { kind: 'user', user: a.user } : { kind: 'guest', guest: a.guest };
}
function viewerOf(a: Actor) {
  return {
    userId: a.kind === 'user' ? a.user.id : null,
    guestId: a.kind === 'guest' ? a.guest.id : null,
  };
}

// ───────────────────────────── Lists ─────────────────────────────

/** POST /feed: the general feed around the reader (P3.1, P3.1a). */
export async function feed(req: Request) {
  const actor = await requireActor(req); // guests may read the feed (P4.2)
  const input = await parseBody(req, feedRequestSchema);
  await limitsFor(actorKey(actor), READ);
  const at = await assertLocationEligible(locationActor(actor), input.reading, 'general.read');
  // D116: opening the feed (its first page) counts toward the anonymous area statistics.
  // Never holds up or fails the feed.
  if (actor.kind === 'user' && !input.cursor) {
    await recordAreaVisit(actor.user.id, at).catch((err: unknown) =>
      logger.warn({ err }, 'area visit not recorded'),
    );
    // D218: chat presence (verified accounts only); never holds up or fails the feed.
    if (actor.user.emailVerifiedAt) {
      await notePresence(actor.user.id, at).catch((err: unknown) =>
        logger.warn({ err }, 'chat presence not recorded'),
      );
    }
  }
  const viewer =
    actor.kind === 'user'
      ? { id: actor.user.id, generalRadiusMiles: await radiusPreference(actor.user.id) }
      : { id: NO_USER, generalRadiusMiles: null };
  const page = await listFeed({
    viewer,
    at,
    sort: input.sort,
    cursor: input.cursor,
    q: input.q,
    type: input.type,
  });
  // D72: "Near Avondale" for the reader's own location only.
  return NextResponse.json({ ...page, area: nearestNeighborhood(at) });
}

/** POST /places/:id/posts/list: a room is readable only within 0.3 mi (D19). */
export async function placePosts(req: Request, ctx: IdCtx) {
  const { user } = await requireUser(req);
  const placeId = await idFrom(ctx);
  const input = await parseBody(req, feedRequestSchema);
  await limits(user.id, READ);
  const place = await activePlacePoint(placeId);
  await assertLocationEligible({ kind: 'user', user }, input.reading, 'business.read', {
    kind: 'business',
    point: place,
  });
  return NextResponse.json(
    await listPlacePosts({ viewerId: user.id, placeId, cursor: input.cursor, type: input.type }),
  );
}

/**
 * POST /topics/:id/posts/list: a citywide topic's posts (D125). Accounts and guests, from
 * anywhere inside Duval (no radius); a closed topic stays readable.
 */
export async function topicPosts(req: Request, ctx: IdCtx) {
  const actor = await requireActor(req);
  const topicId = await idFrom(ctx);
  const input = await parseBody(req, topicPostsSchema);
  await limitsFor(actorKey(actor), READ);
  const viewer = viewerOf(actor).userId ?? NO_USER;
  const topic = await getTopic(topicId, viewer); // 404 for suggestions and unknown topics
  // D133: a local topic is readable only within half a mile of where it was made.
  const anchor = await topicAnchor(topicId);
  await assertLocationEligible(
    locationActor(actor),
    input.reading,
    'general.read',
    anchor.local ? { kind: 'topic', point: anchor.local } : undefined,
  );
  const page = await listTopicPosts({
    viewerId: viewerOf(actor).userId ?? NO_USER,
    topicId,
    sort: input.sort,
    cursor: input.cursor,
    type: input.type,
  });
  return NextResponse.json({ ...page, topic });
}

// ───────────────────────────── Create ─────────────────────────────

/**
 * New posts and comments: text screening (P5.4), then duplicate and link checks (P5.5).
 * Returns why the content must be held, or null to publish it.
 */
async function screenNew(
  user: User,
  input: { body: string; confirmWarning?: true },
): Promise<Hold | null> {
  const screen = await screenText(input.body, 'new-content', input);
  const spamHold = await checkNewContent(user, input.body);
  return screen.held ? holdFor(screen.rule) : spamHold;
}

/**
 * P5.4: held content goes to the moderation queue as an automatic report, and the
 * author is told it will appear after review (202, not an error).
 */
async function heldResponse(
  hold: Hold,
  target: { generalPostId: string } | { businessPostId: string } | { commentId: string },
) {
  await holdReport(hold, target);
  return NextResponse.json(
    {
      held: true,
      message: 'Thanks. A moderator will review this before it appears to others.',
    },
    { status: 202 },
  );
}

const POST_LIMITS: [string, ConfigKey, number][] = [
  ['post-burst', 'rateLimit.post.burstPer10s', 10],
  ['post-min', 'rateLimit.post.perMinute', 60],
  ['post-day', 'rateLimit.post.perDay', 86_400],
];

/** POST /posts: a general post at the author's coarsened location (P3.1, D7). */
export async function createGeneral(req: Request) {
  const { user } = await requireUser(req, VERIFIED);
  const input = await parseBody(req, createPostSchema);
  await limits(user.id, ...POST_LIMITS);
  // D125: a post into a citywide topic: the topic must be open (inside Duval is enough).
  const topic = input.topicId ? await assertTopicOpen(input.topicId) : null;
  // D133: posting in a local topic needs you within half a mile of it.
  const at = await assertLocationEligible(
    { kind: 'user', user },
    input.reading,
    'general.post',
    topic?.local ? { kind: 'topic', point: topic.local } : undefined,
  );
  const hold = await screenNew(user, input);
  const id = await createGeneralPost(
    user.id,
    coarsenPoint(at),
    input.body,
    !!hold,
    input.photoIds,
    input.voiceId,
    input.videoId,
    input.topicId,
  );
  if (hold) return heldResponse(hold, { generalPostId: id });
  // D156: tell anyone it @mentions (held posts tell no one).
  await notifyPostMentions({ kind: 'general', postId: id, authorId: user.id, body: input.body });
  return NextResponse.json(
    { post: await getPostView('general', id, user.id, at) },
    { status: 201 },
  );
}

/** POST /places/:id/posts: a room post, only within 0.3 mi of the place (D19). */
export async function createBusiness(req: Request, ctx: IdCtx) {
  const { user } = await requireUser(req, VERIFIED);
  const placeId = await idFrom(ctx);
  const input = await parseBody(req, createPostSchema);
  await limits(user.id, ...POST_LIMITS);
  const place = await activePlacePoint(placeId);
  await assertLocationEligible({ kind: 'user', user }, input.reading, 'business.post', {
    kind: 'business',
    point: place,
  });
  const hold = await screenNew(user, input);
  const id = await createBusinessPost(
    user.id,
    placeId,
    input.body,
    !!hold,
    input.photoIds,
    input.voiceId,
    input.videoId,
  );
  if (hold) return heldResponse(hold, { businessPostId: id });
  await notifyPostMentions({ kind: 'business', postId: id, authorId: user.id, body: input.body });
  return NextResponse.json({ post: await getPostView('business', id, user.id) }, { status: 201 });
}

// ───────────────────────────── One post ─────────────────────────────

/** POST /posts/:id or /business-posts/:id: the post plus its comment thread. */
export function postDetail(kind: DiscussionKind) {
  return async (req: Request, ctx: IdCtx) => {
    // Guests may read general posts (P4.2); business rooms are registered-only.
    const actor: Actor =
      kind === 'general'
        ? await requireActor(req)
        : { kind: 'user', user: (await requireUser(req)).user };
    const id = await idFrom(ctx);
    const { reading } = await parseBody(req, listCommentsSchema);
    await limitsFor(actorKey(actor), READ);
    // D105: your own post opens from anywhere (to read, edit or delete it); its comments
    // still follow the normal reading rule, so away from it they're left out.
    let at: GeoPoint | undefined;
    let commentsHidden = false;
    try {
      at = await checkPostAccess(locationActor(actor), reading, kind, id, 'read');
    } catch (e) {
      const mine =
        actor.kind === 'user' &&
        e instanceof ApiError &&
        e.status !== 404 &&
        (await postAnchor(kind, id)).authorId === actor.user.id;
      if (!mine) throw e;
      commentsHidden = true;
    }
    const viewer = viewerOf(actor);
    const [post, comments, limit, canComment] = await Promise.all([
      getPostView(kind, id, viewer.userId ?? NO_USER, kind === 'general' ? at : undefined),
      commentsHidden ? [] : listComments(kind, id, viewer),
      getConfig('comments.limitPerPost'),
      // D115: whether this reading is close enough to comment, so the app only offers the box
      // when sending would work (reading a general post needs only Duval; commenting needs the
      // radius). Not a location check of its own: nothing is recorded, and sending checks again.
      commentsHidden ? false : withinCommentRadius(kind, id, reading),
    ]);
    return NextResponse.json({
      post,
      comments,
      commentsHidden,
      commentsLocked: post.commentCount >= limit,
      canComment,
    });
  };
}

/** PATCH: author edits their own post (P3.8). No location check: content already placed. */
export function postEdit(kind: DiscussionKind) {
  return async (req: Request, ctx: IdCtx) => {
    const { user } = await requireUser(req, VERIFIED);
    const id = await idFrom(ctx);
    const input = await parseBody(req, editPostSchema);
    await limits(user.id, ['edit', 'rateLimit.edit.perMinute', 60]);
    await screenText(input.body, 'edit', input);
    await checkEdit(input.body);
    await editPost(kind, id, user.id, input.body);
    return NextResponse.json({ post: await getPostView(kind, id, user.id) });
  };
}

/** DELETE: author soft-deletes their own post (P3.8). */
export function postDelete(kind: DiscussionKind) {
  return async (req: Request, ctx: IdCtx) => {
    const { user } = await requireUser(req);
    const id = await idFrom(ctx);
    await limits(user.id, ['edit', 'rateLimit.edit.perMinute', 60]);
    await deletePost(kind, id, user.id);
    return NextResponse.json({ deleted: true });
  };
}

/** POST /…/:id/comments: comment or reply (P3.3, D20 / D19). Registered users only (D54). */
export function commentCreate(kind: DiscussionKind) {
  return async (req: Request, ctx: IdCtx) => {
    const { user } = await requireUser(req, VERIFIED);
    const postId = await idFrom(ctx);
    const input = await parseBody(req, createCommentSchema);
    await limits(
      user.id,
      ['comment-burst', 'rateLimit.comment.burstPer10s', 10],
      ['comment-min', 'rateLimit.comment.perMinute', 60],
      ['comment-day', 'rateLimit.comment.perDay', 86_400],
    );
    await checkPostAccess({ kind: 'user', user }, input.reading, kind, postId, 'comment');
    const hold = await screenNew(user, input);
    const id = await createComment({
      kind,
      postId,
      author: { kind: 'USER', userId: user.id },
      body: input.body,
      parentCommentId: input.parentCommentId,
      held: !!hold,
    });
    if (hold) return heldResponse(hold, { commentId: id });
    // D156: the post's author, the person replied to, and anyone @mentioned.
    await notifyComment({
      kind,
      postId,
      commentId: id,
      authorId: user.id,
      parentCommentId: input.parentCommentId,
      body: input.body,
    });
    return NextResponse.json({ id }, { status: 201 });
  };
}

/** PUT /…/:id/vote: up, down or clear (P3.4, D6). */
export function postVote(kind: DiscussionKind) {
  return async (req: Request, ctx: IdCtx) => {
    const { user } = await requireUser(req, VERIFIED);
    const id = await idFrom(ctx);
    const input = await parseBody(req, voteSchema);
    await limits(user.id, ...VOTE_RULES);
    await checkPostAccess({ kind: 'user', user }, input.reading, kind, id, 'vote');
    const result = await castVote(user.id, { type: kind, id }, input.value);
    if (input.value === 1) await evaluateForPostAuthor(kind, id); // P6.8, D122 medal levels
    return NextResponse.json(result);
  };
}

// ───────────────────────────── Comments ─────────────────────────────

/** PUT /comments/:id/vote: same location rule as voting on the comment's post. */
export async function commentVote(req: Request, ctx: IdCtx) {
  const { user } = await requireUser(req, VERIFIED);
  const id = await idFrom(ctx);
  const input = await parseBody(req, voteSchema);
  await limits(user.id, ...VOTE_RULES);
  const { kind, postId } = await commentPost(id);
  await checkPostAccess({ kind: 'user', user }, input.reading, kind, postId, 'vote');
  const result = await castVote(user.id, { type: 'comment', id }, input.value);
  if (input.value === 1) await evaluateForCommentAuthor(id); // D122 Helpful Commenter
  return NextResponse.json(result);
}

export async function commentEdit(req: Request, ctx: IdCtx) {
  const { user } = await requireUser(req, VERIFIED);
  const id = await idFrom(ctx);
  const input = await parseBody(req, editCommentSchema);
  await limits(user.id, ['edit', 'rateLimit.edit.perMinute', 60]);
  await screenText(input.body, 'edit', input);
  await checkEdit(input.body);
  await editComment(id, user.id, input.body);
  return NextResponse.json({ edited: true });
}

export async function commentDelete(req: Request, ctx: IdCtx) {
  const { user } = await requireUser(req);
  const id = await idFrom(ctx);
  await limits(user.id, ['edit', 'rateLimit.edit.perMinute', 60]);
  await deleteComment(id, user.id);
  return NextResponse.json({ deleted: true });
}
