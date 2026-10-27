import { endFriendship, friendshipState } from './social/friends';
import { normalizeUsername, type PublicProfile } from '@jax/shared';
import { medalsFor } from './achievements';
import type { User } from '@/generated/prisma/client';
import { decryptUserEmail } from './crypto/field-encryption';
import { signedPhotoUrl } from './media/photos';
import { db } from './db';
import { ApiError } from './http';
import { toMe, type MeUser } from './serializers';

const NOT_FOUND = () => new ApiError(404, 'NOT_FOUND', 'No one by that name');

/**
 * The signed-in user's own account view (D108): the User row plus their profile (bio, photo,
 * color) and private settings, which live in their own tables. Built by the `toMe` serializer.
 */
export async function meView(user: User): Promise<MeUser> {
  const [profile, settings] = await Promise.all([
    db.profile.findUnique({ where: { userId: user.id } }),
    db.userSettings.findUnique({ where: { userId: user.id } }),
  ]);
  return toMe({ ...user, profile, settings, email: decryptUserEmail(user) });
}

/** D108: your radius preference (null = the default), for the feed and Places. */
export async function radiusPreference(userId: string): Promise<number | null> {
  const s = await db.userSettings.findUnique({
    where: { userId },
    select: { generalRadiusMiles: true },
  });
  return s?.generalRadiusMiles ?? null;
}

/**
 * P4.8: someone's public profile, as other people see it. Deleted and banned accounts
 * don't have one, and neither does anyone in a block relationship with the viewer
 * (either direction, P5.2). Never returns private fields (A2).
 */
export async function getPublicProfile(username: string, viewerUserId: string | null) {
  const user = await db.user.findUnique({
    where: { usernameNormalized: normalizeUsername(username) },
    include: { profile: true },
  });
  if (!user || user.status === 'DELETED' || user.status === 'BANNED') throw NOT_FOUND();
  let blockedByMe = false;
  if (viewerUserId && viewerUserId !== user.id) {
    const blocks = await db.userBlock.findMany({
      where: {
        OR: [
          { blockerId: viewerUserId, blockedId: user.id },
          { blockerId: user.id, blockedId: viewerUserId },
        ],
      },
    });
    if (blocks.some((b) => b.blockerId === user.id)) throw NOT_FOUND();
    blockedByMe = blocks.length > 0;
  }
  const postCount =
    (await db.generalPost.count({ where: { authorId: user.id, status: 'VISIBLE' } })) +
    (await db.businessPost.count({ where: { authorId: user.id, status: 'VISIBLE' } }));
  const profile: PublicProfile = {
    username: user.username,
    bio: user.profile?.bio ?? null,
    joinedAt: user.createdAt.toISOString(),
    postCount,
    isMe: viewerUserId === user.id,
    blockedByMe,
    medals: await medalsFor(user.id),
    avatarUrl: user.profile?.avatarPhotoId ? signedPhotoUrl(user.profile.avatarPhotoId) : null,
    color: user.profile?.color ?? 'teal',
    ...(user.staffBadge ? { admin: true as const } : {}), // D141

    // D76: your relationship with them (none for guests or your own profile).
    ...(viewerUserId
      ? await friendshipState(viewerUserId, user.id).then((f) => ({
          friendship: f.state,
          friendRequestId: f.requestId,
        }))
      : { friendship: 'none' as const, friendRequestId: null }),
  };
  return { id: user.id, profile };
}

/** P5.2 (early): block or unblock someone by username. Idempotent; can't block yourself. */
export async function setBlock(blockerId: string, username: string, blocked: boolean) {
  const target = await db.user.findUnique({
    where: { usernameNormalized: normalizeUsername(username) },
    select: { id: true, status: true },
  });
  if (!target || target.status === 'DELETED') throw NOT_FOUND();
  if (target.id === blockerId)
    throw new ApiError(400, 'CANNOT_BLOCK_SELF', "You can't block yourself");
  if (blocked) {
    await db.$transaction(async (tx) => {
      await tx.userBlock.createMany({
        data: [{ blockerId, blockedId: target.id }],
        skipDuplicates: true,
      });
      await endFriendship(tx, blockerId, target.id); // D76: blocking ends a friendship
    });
  } else {
    await db.userBlock.deleteMany({ where: { blockerId, blockedId: target.id } });
  }
}

export type UsernameCtx = { params: Promise<{ username: string }> };

/** The username from the URL; anything that can't be a username is a 404. */
export async function usernameFrom(ctx: UsernameCtx): Promise<string> {
  const { username } = await ctx.params;
  if (!/^[A-Za-z0-9_]{3,20}$/.test(username)) throw NOT_FOUND();
  return username;
}

export async function listBlocks(blockerId: string) {
  const rows = await db.userBlock.findMany({
    where: { blockerId },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, blocked: { select: { username: true, status: true } } },
  });
  return rows
    .filter((r) => r.blocked.status !== 'DELETED')
    .map((r) => ({ username: r.blocked.username, blockedAt: r.createdAt.toISOString() }));
}
