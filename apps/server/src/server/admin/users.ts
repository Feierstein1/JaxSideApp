import type { z } from 'zod';
import type { userActionSchema } from '@jax/shared';
import { normalizeUsername } from '@jax/shared';
import { db } from '../db';
import { ApiError } from '../http';
import { enforce } from '../rate-limit';
import {
  banUser,
  issueStrike,
  liftEnforcement,
  suspendUser,
  voidStrike,
} from '../moderation/enforcement';
import { audit } from './audit';
import { userHistory } from './queue';

/**
 * P5.14 user tools: search, a person's record, and enforcement actions (P5.6).
 * Shows the username and account facts admins need; the email stays encrypted and
 * is never shown here (reveal-with-reason is P5.18).
 */

export async function adminRateLimit(adminId: string) {
  await enforce([
    {
      key: `admin-action:${adminId}`,
      limitKey: 'rateLimit.adminAction.perMinute',
      windowSeconds: 60,
    },
  ]);
}

export async function searchUsers(q: string) {
  const term = normalizeUsername(q.trim().replace(/^@/, ''));
  if (!term) return [];
  const rows = await db.user.findMany({
    where: { usernameNormalized: { startsWith: term } },
    orderBy: { usernameNormalized: 'asc' },
    take: 25,
    select: { id: true, username: true, status: true, role: true, createdAt: true },
  });
  return rows.map((u) => ({ ...u, createdAt: u.createdAt.toISOString() }));
}

export async function getUserRecord(userId: string) {
  const u = await db.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      usernameHistory: { orderBy: { changedAt: 'desc' }, take: 20 },
    },
  });
  if (!u) throw new ApiError(404, 'NOT_FOUND', 'User not found');
  const [posts, comments] = await Promise.all([
    db.generalPost.findMany({
      where: { authorId: userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, body: true, status: true, createdAt: true },
    }),
    db.comment.findMany({
      where: { authorUserId: userId },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: { id: true, body: true, status: true, createdAt: true },
    }),
  ]);
  return {
    id: u.id,
    username: u.username,
    role: u.role,
    staffBadge: u.staffBadge,
    status: u.status,
    suspendedUntil: u.suspendedUntil?.toISOString() ?? null,
    emailVerified: !!u.emailVerifiedAt,
    joinedAt: u.createdAt.toISOString(),
    legalHold: !!u.legalHoldAt,
    bio: u.profile?.bio ?? null,
    previousUsernames: u.usernameHistory.map((h) => ({
      username: h.username,
      changedAt: h.changedAt.toISOString(),
    })),
    recentPosts: posts.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
    recentComments: comments.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
    history: await userHistory(userId),
  };
}

export async function userAction(
  adminId: string,
  userId: string,
  input: z.infer<typeof userActionSchema>,
) {
  const base = { adminId, userId, reason: input.reason };
  const note = 'internalNote' in input ? input.internalNote : undefined;
  let result: unknown = null;
  switch (input.action) {
    case 'strike':
      result = await issueStrike({ ...base, internalNote: note });
      break;
    case 'suspend':
      await suspendUser({ ...base, internalNote: note, hours: input.hours });
      break;
    case 'ban':
      await banUser({ ...base, internalNote: note });
      break;
    case 'lift':
      await liftEnforcement({ ...base, internalNote: note });
      break;
    case 'note': {
      const target = await db.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!target) throw new ApiError(404, 'NOT_FOUND', 'User not found');
      await db.moderationAction.create({
        data: {
          adminId,
          targetUserId: userId,
          action: 'NOTE',
          reason: input.reason,
          internalNote: note,
        },
      });
      break;
    }
    case 'staffBadge': {
      const target = await db.user.findUnique({ where: { id: userId }, select: { status: true } });
      if (!target || target.status === 'DELETED')
        throw new ApiError(404, 'NOT_FOUND', 'User not found');
      await db.user.update({ where: { id: userId }, data: { staffBadge: input.on } });
      break;
    }
    case 'void': {
      const strike = await db.moderationAction.findUnique({ where: { id: input.strikeId } });
      if (!strike || strike.targetUserId !== userId)
        throw new ApiError(404, 'NOT_FOUND', 'Strike not found');
      await voidStrike({ adminId, actionId: input.strikeId, reason: input.reason });
      break;
    }
  }
  await audit(
    adminId,
    `USER_${input.action.toUpperCase()}`,
    { type: 'user', id: userId },
    {
      reason: input.reason,
      ...(input.action === 'suspend' ? { hours: input.hours } : {}),
      ...(input.action === 'staffBadge' ? { on: input.on } : {}),
    },
  );
  return result;
}

export async function listAppeals(status: 'OPEN' | 'ACCEPTED' | 'REJECTED' = 'OPEN') {
  const rows = await db.appeal.findMany({
    where: { status },
    orderBy: { createdAt: status === 'OPEN' ? 'asc' : 'desc' },
    take: 200,
    include: {
      user: { select: { id: true, username: true, status: true } },
      action: { select: { action: true, reason: true, createdAt: true, internalNote: true } },
    },
  });
  return rows.map((a) => ({
    id: a.id,
    status: a.status,
    message: a.message,
    createdAt: a.createdAt.toISOString(),
    decisionNote: a.decisionNote,
    user: a.user,
    strike: {
      action: a.action.action,
      reason: a.action.reason,
      internalNote: a.action.internalNote,
      createdAt: a.action.createdAt.toISOString(),
    },
  }));
}
