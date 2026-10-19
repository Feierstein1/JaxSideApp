import {
  normalizeUsername,
  type FriendActivityItem,
  type FriendRequestView,
  type FriendshipState,
  type FriendUser,
  type FriendView,
} from '@jax/shared';
import { Prisma } from '@/generated/prisma/client';
import { getConfig } from '../config';
import { db } from '../db';
import { ApiError } from '../http';
import { nearestNeighborhood } from '../location/neighborhood';
import { signedPhotoUrl } from '../media/photos';
import { notify } from './notifications';

/**
 * D76: friendships. Mutual and by request: a request becomes a friendship only when the
 * other person accepts (or sends one back). Blocking either way ends it and stops new
 * requests. Friend lists are private to their owner.
 */

const NOT_FOUND = () => new ApiError(404, 'NOT_FOUND', 'User not found');

/** One row per pair, stored in id order (DB check `Friendship_pair_order`). */
export const pair = (a: string, b: string) =>
  a < b ? { userLowId: a, userHighId: b } : { userLowId: b, userHighId: a };
const other = (row: { userLowId: string; userHighId: string }, me: string) =>
  row.userLowId === me ? row.userHighId : row.userLowId;

const userSelect = {
  id: true,
  username: true,
  status: true,
  profileColor: true,
  profile: { select: { avatarPhotoId: true } },
} as const;

type SelectedUser = Prisma.UserGetPayload<{ select: typeof userSelect }>;

export function friendUser(u: SelectedUser): FriendUser {
  return {
    username: u.username,
    color: u.profileColor,
    avatarUrl: u.profile?.avatarPhotoId ? signedPhotoUrl(u.profile.avatarPhotoId) : null,
  };
}

async function blockedEitherWay(a: string, b: string) {
  const rows = await db.userBlock.findMany({
    where: {
      OR: [
        { blockerId: a, blockedId: b },
        { blockerId: b, blockedId: a },
      ],
    },
    select: { blockerId: true },
  });
  return { byMe: rows.some((r) => r.blockerId === a), byThem: rows.some((r) => r.blockerId === b) };
}

export async function friendshipState(
  me: string,
  otherId: string,
): Promise<{ state: FriendshipState; requestId: string | null }> {
  if (me === otherId) return { state: 'none', requestId: null };
  const row = await db.friendship.findUnique({
    where: { userLowId_userHighId: pair(me, otherId) },
  });
  if (!row) return { state: 'none', requestId: null };
  if (row.status === 'ACCEPTED') return { state: 'friends', requestId: null };
  return { state: row.requesterId === me ? 'requested' : 'incoming', requestId: row.id };
}

/**
 * Send a request by username. If they already asked you, this accepts it. Idempotent:
 * asking again while pending (or already friends) changes nothing.
 */
export async function sendFriendRequest(me: string, username: string) {
  const target = await db.user.findUnique({
    where: { usernameNormalized: normalizeUsername(username) },
    select: { id: true, status: true },
  });
  if (!target || target.status !== 'ACTIVE') throw NOT_FOUND();
  if (target.id === me) throw new ApiError(400, 'CANNOT_FRIEND_SELF', 'That’s you!');
  const blocks = await blockedEitherWay(me, target.id);
  if (blocks.byThem) throw NOT_FOUND(); // like their profile: no hint they blocked you
  if (blocks.byMe) {
    throw new ApiError(409, 'BLOCKED', 'Unblock them first to send a friend request.');
  }

  const existing = await db.friendship.findUnique({
    where: { userLowId_userHighId: pair(me, target.id) },
  });
  if (existing?.status === 'ACCEPTED') return { state: 'friends' as const };
  if (existing && existing.requesterId === me) return { state: 'requested' as const };
  if (existing) {
    await acceptRow(existing.id, me);
    return { state: 'friends' as const };
  }

  const [maxFriends, maxPending] = await Promise.all([
    getConfig('friends.max'),
    getConfig('friends.maxPendingOut'),
  ]);
  if ((await friendCount(me)) >= maxFriends || (await friendCount(target.id)) >= maxFriends) {
    throw new ApiError(409, 'FRIENDS_FULL', `People can have up to ${maxFriends} friends.`);
  }
  const pending = await db.friendship.count({ where: { requesterId: me, status: 'PENDING' } });
  if (pending >= maxPending) {
    throw new ApiError(
      409,
      'TOO_MANY_PENDING',
      `You have ${pending} requests waiting. Wait for some answers first.`,
    );
  }
  try {
    await db.$transaction(async (tx) => {
      await tx.friendship.create({ data: { ...pair(me, target.id), requesterId: me } });
      await notify(tx, target.id, 'FRIEND_REQUEST', me);
    });
  } catch (err) {
    // Both asked at the same moment: the other request won; accept it.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
      return sendFriendRequest(me, username);
    }
    throw err;
  }
  return { state: 'requested' as const };
}

const friendCount = (id: string) =>
  db.friendship.count({
    where: { status: 'ACCEPTED', OR: [{ userLowId: id }, { userHighId: id }] },
  });

async function acceptRow(id: string, me: string) {
  await db.$transaction(async (tx) => {
    const res = await tx.friendship.updateMany({
      where: { id, status: 'PENDING', requesterId: { not: me } },
      data: { status: 'ACCEPTED', acceptedAt: new Date() },
    });
    if (res.count !== 1) return;
    const row = await tx.friendship.findUniqueOrThrow({ where: { id } });
    await notify(tx, row.requesterId, 'FRIEND_ACCEPTED', me);
    // The request's own notification is answered now.
    await tx.notification.updateMany({
      where: { userId: me, actorId: row.requesterId, type: 'FRIEND_REQUEST', readAt: null },
      data: { readAt: new Date() },
    });
  });
}

/** Accept or decline a request sent to you. Anyone else's request is a 404. */
export async function answerFriendRequest(me: string, id: string, accept: boolean) {
  const row = await db.friendship.findFirst({
    where: {
      id,
      status: 'PENDING',
      requesterId: { not: me },
      OR: [{ userLowId: me }, { userHighId: me }],
    },
  });
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Request not found');
  if (accept) {
    await acceptRow(row.id, me);
  } else {
    // Declining is quiet: the sender isn't told, the request just goes away.
    await db.$transaction([
      db.friendship.delete({ where: { id: row.id } }),
      db.notification.updateMany({
        where: { userId: me, actorId: row.requesterId, type: 'FRIEND_REQUEST', readAt: null },
        data: { readAt: new Date() },
      }),
    ]);
  }
}

/** Withdraw a request you sent. */
export async function cancelFriendRequest(me: string, id: string) {
  const row = await db.friendship.findFirst({
    where: { id, status: 'PENDING', requesterId: me },
  });
  if (!row) throw new ApiError(404, 'NOT_FOUND', 'Request not found');
  await db.$transaction([
    db.friendship.delete({ where: { id: row.id } }),
    // Their unanswered bell item for it goes too.
    db.notification.deleteMany({
      where: { userId: other(row, me), actorId: me, type: 'FRIEND_REQUEST', readAt: null },
    }),
  ]);
}

/** Remove a friend (either person can). */
export async function unfriend(me: string, username: string) {
  const target = await db.user.findUnique({
    where: { usernameNormalized: normalizeUsername(username) },
    select: { id: true },
  });
  if (!target) throw NOT_FOUND();
  await db.friendship.deleteMany({
    where: { ...pair(me, target.id), status: 'ACCEPTED' },
  });
}

/** Called when either person blocks the other: any friendship or request ends. */
export async function endFriendship(tx: Prisma.TransactionClient, a: string, b: string) {
  await tx.friendship.deleteMany({ where: pair(a, b) });
}

export async function listFriends(me: string): Promise<FriendView[]> {
  const rows = await db.friendship.findMany({
    where: { status: 'ACCEPTED', OR: [{ userLowId: me }, { userHighId: me }] },
    include: { userLow: { select: userSelect }, userHigh: { select: userSelect } },
    orderBy: { acceptedAt: 'desc' },
  });
  return rows
    .map((r) => ({ u: r.userLowId === me ? r.userHigh : r.userLow, since: r.acceptedAt! }))
    .filter(({ u }) => u.status === 'ACTIVE')
    .map(({ u, since }) => ({ ...friendUser(u), since: since.toISOString() }));
}

export async function listFriendRequests(me: string) {
  const rows = await db.friendship.findMany({
    where: { status: 'PENDING', OR: [{ userLowId: me }, { userHighId: me }] },
    include: { userLow: { select: userSelect }, userHigh: { select: userSelect } },
    orderBy: { createdAt: 'desc' },
  });
  const view = (r: (typeof rows)[number]): FriendRequestView | null => {
    const u = r.userLowId === me ? r.userHigh : r.userLow;
    return u.status === 'ACTIVE'
      ? { id: r.id, user: friendUser(u), createdAt: r.createdAt.toISOString() }
      : null;
  };
  return {
    incoming: rows
      .filter((r) => r.requesterId !== me)
      .map(view)
      .filter((v) => v !== null),
    outgoing: rows
      .filter((r) => r.requesterId === me)
      .map(view)
      .filter((v) => v !== null),
  };
}

/** IDs of my active friends (for the feed and "friends who favorited"). */
export async function friendIds(me: string): Promise<string[]> {
  const rows = await db.friendship.findMany({
    where: { status: 'ACCEPTED', OR: [{ userLowId: me }, { userHighId: me }] },
    select: { userLowId: true, userHighId: true },
  });
  return rows.map((r) => other(r, me));
}

interface ActivityRow {
  id: string;
  kind: 'general' | 'business';
  created_at: Date;
  latitude: number | null;
  longitude: number | null;
  place_id: string | null;
  place_name: string | null;
  author_id: string;
}

/**
 * D76: the friends feed. "@name posted near Avondale" (area posts: the neighborhood
 * closest to where it was posted) or "@name posted at Bold Bean" (place posts). It never
 * includes the post's text, photos or coordinates. Friends who turned on "Hide my recent
 * posts from friends", or who blocked you, are left out.
 */
export async function friendActivity(
  me: string,
  before?: string,
  /** D89: only friends whose username starts with this. */
  q?: string,
): Promise<{ items: FriendActivityItem[]; nextBefore: string | null }> {
  const ids = await friendIds(me);
  if (!ids.length) return { items: [], nextBefore: null };
  const days = await getConfig('friends.activityDays');
  const size = 30;
  const cursor = before ? new Date(before) : null;
  if (cursor && Number.isNaN(cursor.getTime())) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Invalid cursor');
  }
  const authors = Prisma.sql`(SELECT u.id FROM "User" u
      WHERE u.id IN (${Prisma.join(ids.map((i) => Prisma.sql`${i}::uuid`))})
        AND u.status = 'ACTIVE' AND u."hidePostsFromFriends" = false
        ${q ? Prisma.sql`AND u."usernameNormalized" LIKE ${q.toLowerCase() + '%'}` : Prisma.empty}
        AND NOT EXISTS (SELECT 1 FROM "UserBlock" b
          WHERE (b."blockerId" = u.id AND b."blockedId" = ${me}::uuid)
             OR (b."blockerId" = ${me}::uuid AND b."blockedId" = u.id)))`;
  const window = Prisma.sql`now() - make_interval(days => ${days}::int)`;
  const after = cursor ? Prisma.sql`AND a.created_at < ${cursor}` : Prisma.empty;
  const rows = await db.$queryRaw<ActivityRow[]>`
    SELECT * FROM (
      SELECT p.id, 'general' AS kind, p."createdAt" AS created_at,
             ST_Y(p.location::geometry) AS latitude, ST_X(p.location::geometry) AS longitude,
             NULL::uuid AS place_id, NULL AS place_name, p."authorId" AS author_id
      FROM "GeneralPost" p
      WHERE p.status = 'VISIBLE' AND p."authorId" IN ${authors} AND p."createdAt" > ${window}
      UNION ALL
      SELECT p.id, 'business', p."createdAt", NULL, NULL, pl.id, pl.name, p."authorId"
      FROM "BusinessPost" p JOIN "BusinessPlace" pl ON pl.id = p."placeId"
      WHERE p.status = 'VISIBLE' AND pl.status = 'ACTIVE' AND p."authorId" IN ${authors}
        AND p."createdAt" > ${window}
    ) a
    WHERE true ${after}
    ORDER BY a.created_at DESC, a.id DESC
    LIMIT ${size + 1}`;
  const users = new Map(
    (
      await db.user.findMany({
        where: { id: { in: [...new Set(rows.map((r) => r.author_id))] } },
        select: userSelect,
      })
    ).map((u) => [u.id, u]),
  );
  const page = rows.slice(0, size);
  return {
    items: page.map((r) => ({
      id: r.id,
      kind: r.kind,
      author: friendUser(users.get(r.author_id)!),
      area:
        r.kind === 'general' && r.latitude !== null && r.longitude !== null
          ? nearestNeighborhood({ latitude: r.latitude, longitude: r.longitude })
          : null,
      place: r.place_id ? { id: r.place_id, name: r.place_name! } : null,
      createdAt: r.created_at.toISOString(),
    })),
    nextBefore: rows.length > size ? page[page.length - 1]!.created_at.toISOString() : null,
  };
}

/** D74/D76: which of my friends favorited this place (the count itself is public). */
export async function friendsWhoFavorited(me: string, placeId: string): Promise<FriendUser[]> {
  const ids = await friendIds(me);
  if (!ids.length) return [];
  const rows = await db.favoritePlace.findMany({
    where: { placeId, userId: { in: ids }, user: { status: 'ACTIVE' } },
    include: { user: { select: userSelect } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
  return rows.map((r) => friendUser(r.user));
}
