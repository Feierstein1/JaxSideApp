import { medalKeysSql } from '../achievements';
import { attachPhotos, attachVoice, signedPhotoUrl } from '../media/photos';
import {
  milesToMeters,
  type DiscussionKind,
  type FeedSort,
  type PostTypeFilter,
  type PostView,
} from '@jax/shared';
import { Prisma } from '@/generated/prisma/client';
import { getConfig } from '../config';
import { db } from '../db';
import { ApiError } from '../http';
import type { GeoPoint } from '../location/eligibility';
import { decodeCursor, encodeCursor } from './cursor';

/**
 * Posts for both discussion types (P3.1, P3.2). General posts live in GeneralPost and
 * belong to an area (coarsened point); business posts live in BusinessPost and belong to
 * one canonical place. The two never mix (§2).
 */

export const TABLE = {
  general: Prisma.raw('"GeneralPost"'),
  business: Prisma.raw('"BusinessPost"'),
} as const;
const VOTE_COLUMN = {
  general: Prisma.raw('"generalPostId"'),
  business: Prisma.raw('"businessPostId"'),
} as const;

interface PostRow {
  id: string;
  body: string;
  createdAt: Date;
  editedAt: Date | null;
  score: number;
  upCount: number;
  downCount: number;
  commentCount: number;
  authorId: string;
  username: string;
  author_status: string;
  medals: string[];
  author_color: string;
  avatar_photo_id: string | null;
  photos: { id: string; width: number; height: number }[] | null;
  voice: { id: string; durationMs: number } | null;
  my_vote: number | null;
  distance: number | null;
  place_id: string | null;
  place_name: string | null;
}

function toView(r: PostRow, kind: DiscussionKind, viewerId: string): PostView {
  return {
    id: r.id,
    kind,
    body: r.body,
    createdAt: r.createdAt.toISOString(),
    editedAt: r.editedAt?.toISOString() ?? null,
    author:
      r.author_status === 'DELETED'
        ? { deleted: true }
        : {
            username: r.username,
            medals: r.medals,
            color: r.author_color,
            avatarUrl: r.avatar_photo_id ? signedPhotoUrl(r.avatar_photo_id) : null,
          },
    score: r.score,
    upCount: r.upCount,
    downCount: r.downCount,
    commentCount: r.commentCount,
    myVote: (r.my_vote ?? 0) as -1 | 0 | 1,
    isMine: r.authorId === viewerId,
    // Coarse point (~100 m grid, D7), rounded again: an approximate "how far".
    distanceMeters: r.distance === null ? null : Math.round(r.distance / 50) * 50,
    place: r.place_id ? { id: r.place_id, name: r.place_name! } : null,
    photos: (r.photos ?? []).map((p) => ({ ...p, url: signedPhotoUrl(p.id) })),
    voice: r.voice ? { ...r.voice, url: signedPhotoUrl(r.voice.id) } : null,
    type: r.voice ? ('voice' as const) : r.photos?.length ? ('media' as const) : ('text' as const),
  };
}

const point = (p: GeoPoint) =>
  Prisma.sql`ST_SetSRID(ST_MakePoint(${p.longitude}, ${p.latitude}), 4326)::geography`;

/** Hides content between users who blocked each other, in either direction (P3.9). */
function notBlocked(viewerId: string, authorColumn: Prisma.Sql) {
  return Prisma.sql`AND NOT EXISTS (
    SELECT 1 FROM "UserBlock" b
    WHERE (b."blockerId" = ${viewerId}::uuid AND b."blockedId" = ${authorColumn})
       OR (b."blockerId" = ${authorColumn} AND b."blockedId" = ${viewerId}::uuid))`;
}

function selectPosts(kind: DiscussionKind, viewerId: string, from?: GeoPoint) {
  const distance =
    kind === 'general' && from
      ? Prisma.sql`ST_Distance(p.location, ${point(from)})`
      : Prisma.sql`NULL::float8`;
  const place =
    kind === 'business'
      ? Prisma.sql`pl.id AS place_id, pl.name AS place_name`
      : Prisma.sql`NULL::uuid AS place_id, NULL::text AS place_name`;
  const join =
    kind === 'business' ? Prisma.sql`JOIN "BusinessPlace" pl ON pl.id = p."placeId"` : Prisma.empty;
  return Prisma.sql`
    SELECT p.id, p.body, p."createdAt", p."editedAt", p.score, p."upCount", p."downCount",
           p."commentCount", p."authorId", u.username, u.status::text AS author_status,
           u."profileColor" AS author_color, pr."avatarPhotoId" AS avatar_photo_id,
           ${medalKeysSql(Prisma.sql`p."authorId"`)} AS medals,
           (SELECT json_agg(json_build_object('id', ph.id, 'width', ph.width, 'height', ph.height)
                            ORDER BY ph."createdAt")
            FROM "Photo" ph
            WHERE ph.${VOTE_COLUMN[kind]} = p.id AND ph.status = 'ACTIVE' AND ph.kind = 'IMAGE') AS photos,
           (SELECT json_build_object('id', vc.id, 'durationMs', vc."durationMs")
            FROM "Photo" vc
            WHERE vc.${VOTE_COLUMN[kind]} = p.id AND vc.status = 'ACTIVE' AND vc.kind = 'AUDIO'
            LIMIT 1) AS voice,
           v.value AS my_vote, ${distance} AS distance, ${place}
    FROM ${TABLE[kind]} p
    JOIN "User" u ON u.id = p."authorId"
    LEFT JOIN "Profile" pr ON pr."userId" = u.id
    ${join}
    LEFT JOIN "Vote" v ON v.${VOTE_COLUMN[kind]} = p.id AND v."voterId" = ${viewerId}::uuid`;
}

async function page(
  rows: PostRow[],
  size: number,
  kind: DiscussionKind,
  viewerId: string,
  next: (last: PostRow) => string,
) {
  const more = rows.length > size;
  const items = rows.slice(0, size);
  return {
    posts: items.map((r) => toView(r, kind, viewerId)),
    nextCursor: more ? next(items[items.length - 1]!) : null,
  };
}

/** The viewer's feed radius in meters: their preference, clamped to the server range (§7). */
async function feedRadiusMeters(pref: number | null): Promise<number> {
  const [def, min, max] = await Promise.all([
    getConfig('radius.general.defaultMiles'),
    getConfig('radius.general.minMiles'),
    getConfig('radius.general.maxMiles'),
  ]);
  return milesToMeters(Math.min(max, Math.max(min, pref ?? def)));
}

/** P3.1 general feed around the viewer's verified location; "new" or "top" (P3.6). */
export async function listFeed(opts: {
  viewer: { id: string; generalRadiusMiles: number | null };
  at: GeoPoint;
  sort: FeedSort;
  cursor?: string;
  q?: string;
  type?: PostTypeFilter;
}) {
  const [size, topDays, radius] = await Promise.all([
    getConfig('feed.pageSize'),
    getConfig('feed.topWindowDays'),
    feedRadiusMeters(opts.viewer.generalRadiusMiles),
  ]);
  const c = decodeCursor(opts.cursor);
  const base = Prisma.sql`${selectPosts('general', opts.viewer.id, opts.at)}
    WHERE p.status = 'VISIBLE' AND ST_DWithin(p.location, ${point(opts.at)}, ${radius})
      ${notBlocked(opts.viewer.id, Prisma.sql`p."authorId"`)} ${searchFilter(opts.q)}
      ${typeFilter('general', opts.type)}`;

  if (opts.sort === 'top') {
    const offset = c && 'o' in c ? c.o : 0;
    const rows = await db.$queryRaw<PostRow[]>`${base}
      AND p."createdAt" > now() - make_interval(days => ${topDays}::int)
      ORDER BY p.score DESC, p."createdAt" DESC, p.id DESC
      LIMIT ${size + 1} OFFSET ${offset}`;
    return page(rows, size, 'general', opts.viewer.id, () => encodeCursor({ o: offset + size }));
  }
  const after =
    c && 't' in c
      ? Prisma.sql`AND (p."createdAt", p.id) < (${new Date(c.t)}::timestamptz, ${c.id}::uuid)`
      : Prisma.empty;
  const rows = await db.$queryRaw<PostRow[]>`${base} ${after}
    ORDER BY p."createdAt" DESC, p.id DESC LIMIT ${size + 1}`;
  return page(rows, size, 'general', opts.viewer.id, (l) =>
    encodeCursor({ t: l.createdAt.toISOString(), id: l.id }),
  );
}

/** D75: only posts of one type (text, media, voice or video), decided by attachments. */
function typeFilter(kind: DiscussionKind, type: PostTypeFilter = 'all') {
  if (type === 'all') return Prisma.empty;
  const has = (k: 'IMAGE' | 'AUDIO' | 'VIDEO') => Prisma.sql`EXISTS (SELECT 1 FROM "Photo" m
      WHERE m.${VOTE_COLUMN[kind]} = p.id AND m.status = 'ACTIVE' AND m.kind = ${k}::"MediaKind")`;
  if (type === 'text') {
    return Prisma.sql`AND NOT EXISTS (SELECT 1 FROM "Photo" m
      WHERE m.${VOTE_COLUMN[kind]} = p.id AND m.status = 'ACTIVE')`;
  }
  return Prisma.sql`AND ${has(type === 'media' ? 'IMAGE' : type === 'voice' ? 'AUDIO' : 'VIDEO')}`;
}

/**
 * D74: feed search, still only within the reader's radius (searching a name city-wide would
 * show where that person posts). "@name" matches usernames that start with it; plain text
 * matches post text anywhere or a username that starts with it. Deleted accounts never
 * match by name.
 */
function searchFilter(q?: string) {
  if (!q) return Prisma.empty;
  // Typed % and _ are literal characters, not wildcards.
  const like = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);
  const name = q.startsWith('@') ? q.slice(1) : q;
  const byName = Prisma.sql`(u.status <> 'DELETED' AND u."usernameNormalized" LIKE ${like(name.toLowerCase()) + '%'})`;
  if (q.startsWith('@')) return Prisma.sql`AND ${byName}`;
  return Prisma.sql`AND (p.body ILIKE ${'%' + like(q) + '%'} OR ${byName})`;
}

/** P3.2 a place's room, newest first. Access is checked by the caller (D19). */
export async function listPlacePosts(opts: {
  viewerId: string;
  placeId: string;
  cursor?: string;
  type?: PostTypeFilter;
}) {
  const size = await getConfig('feed.pageSize');
  const c = decodeCursor(opts.cursor);
  const after =
    c && 't' in c
      ? Prisma.sql`AND (p."createdAt", p.id) < (${new Date(c.t)}::timestamptz, ${c.id}::uuid)`
      : Prisma.empty;
  const rows = await db.$queryRaw<PostRow[]>`${selectPosts('business', opts.viewerId)}
    WHERE p.status = 'VISIBLE' AND p."placeId" = ${opts.placeId}::uuid
      ${notBlocked(opts.viewerId, Prisma.sql`p."authorId"`)} ${typeFilter('business', opts.type)} ${after}
    ORDER BY p."createdAt" DESC, p.id DESC LIMIT ${size + 1}`;
  return page(rows, size, 'business', opts.viewerId, (l) =>
    encodeCursor({ t: l.createdAt.toISOString(), id: l.id }),
  );
}

export async function getPostView(
  kind: DiscussionKind,
  id: string,
  viewerId: string,
  at?: GeoPoint,
) {
  const rows = await db.$queryRaw<PostRow[]>`${selectPosts(kind, viewerId, at)}
    WHERE p.id = ${id}::uuid AND p.status = 'VISIBLE'
      ${notBlocked(viewerId, Prisma.sql`p."authorId"`)}`;
  if (!rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Post not found');
  return toView(rows[0], kind, viewerId);
}

/**
 * Where a post "is", for location checks: a general post's stored (coarsened) point
 * (D20), or a business post's place (D19). Only visible posts.
 */
export async function postAnchor(kind: DiscussionKind, id: string) {
  const rows =
    kind === 'general'
      ? await db.$queryRaw<{ authorId: string; latitude: number; longitude: number }[]>`
          SELECT "authorId", ST_Y(location::geometry) AS latitude, ST_X(location::geometry) AS longitude
          FROM "GeneralPost" WHERE id = ${id}::uuid AND status = 'VISIBLE'`
      : await db.$queryRaw<
          { authorId: string; latitude: number; longitude: number; placeId: string }[]
        >`
          SELECT p."authorId", pl.latitude, pl.longitude, p."placeId"
          FROM "BusinessPost" p JOIN "BusinessPlace" pl ON pl.id = p."placeId"
          WHERE p.id = ${id}::uuid AND p.status = 'VISIBLE' AND pl.status = 'ACTIVE'`;
  if (!rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Post not found');
  return rows[0];
}

/** P3.1: the server assigns the (already coarsened) point; the client can't choose it. */
export async function createGeneralPost(
  authorId: string,
  at: GeoPoint,
  body: string,
  held = false,
  photoIds: string[] = [],
  voiceId?: string,
) {
  // P5.4: a held post is stored hidden until a moderator reviews it.
  const status = held ? 'HELD_FOR_REVIEW' : 'VISIBLE';
  return db.$transaction(async (tx) => {
    const [row] = await tx.$queryRaw<{ id: string }[]>`
    INSERT INTO "GeneralPost" (id, "authorId", body, location, status, "updatedAt")
    VALUES (gen_random_uuid(), ${authorId}::uuid, ${body}, ${point(at)},
            ${status}::"ContentStatus", now())
    RETURNING id`;
    await attachPhotos(tx, authorId, photoIds, { generalPostId: row!.id });
    await attachVoice(tx, authorId, voiceId, { generalPostId: row!.id });
    return row!.id;
  });
}

/** P3.2: a room post; the place's post count moves in the same transaction (D41). */
export async function createBusinessPost(
  authorId: string,
  placeId: string,
  body: string,
  held = false,
  photoIds: string[] = [],
  voiceId?: string,
) {
  return db.$transaction(async (tx) => {
    const post = await tx.businessPost.create({
      data: { authorId, placeId, body, status: held ? 'HELD_FOR_REVIEW' : 'VISIBLE' },
      select: { id: true },
    });
    await attachPhotos(tx, authorId, photoIds, { businessPostId: post.id });
    await attachVoice(tx, authorId, voiceId, { businessPostId: post.id });
    if (held) return post.id; // counted once a moderator approves it
    await tx.businessPlace.update({
      where: { id: placeId },
      data: { postCount: { increment: 1 } },
    });
    return post.id;
  });
}

/** P3.8: authors edit their own visible posts. Anyone else gets 404 (no IDOR hints). */
export async function editPost(kind: DiscussionKind, id: string, userId: string, body: string) {
  const res = await db.$executeRaw`
    UPDATE ${TABLE[kind]} SET body = ${body}, "editedAt" = now(), "updatedAt" = now()
    WHERE id = ${id}::uuid AND "authorId" = ${userId}::uuid AND status = 'VISIBLE'`;
  if (res !== 1) throw new ApiError(404, 'NOT_FOUND', 'Post not found');
}

/** P3.8: soft delete by the author. Business-room counts move with it. */
export async function deletePost(kind: DiscussionKind, id: string, userId: string) {
  await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ placeId: string | null }[]>`
      UPDATE ${TABLE[kind]} SET status = 'DELETED', "updatedAt" = now()
      WHERE id = ${id}::uuid AND "authorId" = ${userId}::uuid AND status = 'VISIBLE'
      RETURNING ${kind === 'business' ? Prisma.sql`"placeId"` : Prisma.sql`NULL::uuid AS "placeId"`}`;
    if (!rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Post not found');
    if (rows[0].placeId) {
      await tx.businessPlace.update({
        where: { id: rows[0].placeId },
        data: { postCount: { decrement: 1 } },
      });
    }
  });
}

/** P4.8: an author's recent area-feed posts (business-room posts stay behind D19). */
export async function listAuthorPosts(
  authorId: string,
  viewerId: string,
  at: GeoPoint,
  limit = 10,
) {
  const rows = await db.$queryRaw<PostRow[]>`${selectPosts('general', viewerId, at)}
    WHERE p.status = 'VISIBLE' AND p."authorId" = ${authorId}::uuid
      ${notBlocked(viewerId, Prisma.sql`p."authorId"`)}
    ORDER BY p."createdAt" DESC, p.id DESC LIMIT ${limit}`;
  return rows.map((r) => toView(r, 'general', viewerId));
}
