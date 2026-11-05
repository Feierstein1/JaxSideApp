import type { ModerationActionType, Prisma } from '@/generated/prisma/client';
import { revokeAllSessions } from '../auth/sessions';
import { resolveAutoSuspension } from './auto-suspend';
import { getConfig } from '../config';
import { db } from '../db';
import { ApiError } from '../http';

/**
 * P5.6 strikes, suspensions and bans (§11.3, D9, D58). Called by the admin portal
 * (P5.14); every step is a `ModerationAction` row tied to the user's permanent ID, so
 * history survives username changes (MS4).
 *
 * Strike ladder (configurable): 1st = warning, 2nd = 24 h suspension, 3rd = 7 day
 * suspension, 4th = permanent ban. Strikes stop counting after `strikes.decayDays`.
 * Admins can also suspend or ban directly for serious cases; those count as strikes.
 * Nothing here runs automatically: a person decides (§11.2).
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
export const STRIKE_ACTIONS: ModerationActionType[] = ['WARN', 'SUSPEND', 'BAN'];

export interface ActionInput {
  adminId: string;
  userId: string;
  /** Shown to the user (keep it factual). */
  reason: string;
  /** Internal only; never shown to the user. */
  internalNote?: string;
  reportId?: string;
  now?: Date;
}

/** Strikes that still count: not voided and inside the decay window. */
export async function activeStrikes(userId: string, now = new Date()) {
  const decayDays = await getConfig('strikes.decayDays');
  return db.moderationAction.findMany({
    where: {
      targetUserId: userId,
      action: { in: STRIKE_ACTIONS },
      voidedAt: null,
      createdAt: { gt: new Date(now.getTime() - decayDays * DAY_MS) },
    },
    orderBy: { createdAt: 'asc' },
  });
}

async function targetUser(userId: string) {
  const u = await db.user.findUnique({ where: { id: userId } });
  if (!u || u.status === 'DELETED') throw new ApiError(404, 'NOT_FOUND', 'User not found');
  // Admin accounts are managed outside the portal, so a hijacked admin can't silence others.
  if (u.role === 'ADMIN') {
    throw new ApiError(403, 'FORBIDDEN', 'Admins can’t be sanctioned from the portal');
  }
  return u;
}

async function record(
  tx: Prisma.TransactionClient,
  input: ActionInput,
  action: ModerationActionType,
  extra: { durationHours?: number; expiresAt?: Date } = {},
) {
  const row = await tx.moderationAction.create({
    data: {
      adminId: input.adminId,
      targetUserId: input.userId,
      action,
      reason: input.reason,
      internalNote: input.internalNote ?? null,
      reportId: input.reportId ?? null,
      durationHours: extra.durationHours ?? null,
      expiresAt: extra.expiresAt ?? null,
      createdAt: input.now,
    },
  });
  // D205: every strike goes in the person's bell with its reason (hidden again if cancelled).
  if (STRIKE_ACTIONS.includes(action)) {
    await tx.notification.create({
      data: {
        userId: input.userId,
        type: 'STRIKE',
        moderationActionId: row.id,
        createdAt: input.now,
      },
    });
  }
  return row;
}

/** Suspends for `hours`. Never shortens a longer suspension already in force. */
async function applySuspension(tx: Prisma.TransactionClient, input: ActionInput, hours: number) {
  const now = input.now ?? new Date();
  const until = new Date(now.getTime() + hours * HOUR_MS);
  const u = await tx.user.findUniqueOrThrow({ where: { id: input.userId } });
  const keep = u.status === 'SUSPENDED' && u.suspendedUntil && u.suspendedUntil > until;
  if (!keep) {
    await tx.user.update({
      where: { id: input.userId },
      data: { status: 'SUSPENDED', suspendedUntil: until },
    });
  }
  return record(tx, input, 'SUSPEND', { durationHours: hours, expiresAt: until });
}

/**
 * Ban: the account can't sign in, every session ends, and the phones it signed in on
 * are banned too (no new accounts or guest sessions from them, P4.6 / MS4).
 */
async function applyBan(tx: Prisma.TransactionClient, input: ActionInput) {
  const now = input.now ?? new Date();
  await tx.user.update({
    where: { id: input.userId },
    data: { status: 'BANNED', suspendedUntil: null },
  });
  const installs = await tx.session.findMany({
    where: { userId: input.userId, installationId: { not: null } },
    select: { installationId: true },
    distinct: ['installationId'],
  });
  await tx.installation.updateMany({
    where: { id: { in: installs.map((s) => s.installationId!) }, bannedAt: null },
    data: { bannedAt: now },
  });
  return record(tx, input, 'BAN');
}

export type StrikeOutcome =
  | { action: 'WARN'; strike: number }
  | { action: 'SUSPEND'; strike: number; hours: number; until: Date }
  | { action: 'BAN'; strike: number };

/** Adds a strike and applies the next step of the ladder (D9). */
export async function issueStrike(input: ActionInput): Promise<StrikeOutcome> {
  const now = input.now ?? new Date();
  const user = await targetUser(input.userId);
  if (user.status === 'BANNED') throw new ApiError(409, 'ALREADY_BANNED', 'Already banned');
  const [strikes, first, second, banAt] = await Promise.all([
    activeStrikes(input.userId, now),
    getConfig('strikes.firstSuspensionHours'),
    getConfig('strikes.secondSuspensionHours'),
    getConfig('strikes.banAtStrike'),
  ]);
  const strike = strikes.length + 1;
  const withNow = { ...input, now };
  if (strike >= banAt) {
    await db.$transaction((tx) => applyBan(tx, withNow));
    await revokeAllSessions(input.userId);
    return { action: 'BAN', strike };
  }
  if (strike === 1) {
    await db.$transaction((tx) => record(tx, withNow, 'WARN'));
    return { action: 'WARN', strike };
  }
  const hours = strike === 2 ? first : second;
  await db.$transaction((tx) => applySuspension(tx, withNow, hours));
  return { action: 'SUSPEND', strike, hours, until: new Date(now.getTime() + hours * HOUR_MS) };
}

/** Direct suspension for serious cases (counts as a strike). */
export async function suspendUser(input: ActionInput & { hours: number }) {
  if (!Number.isInteger(input.hours) || input.hours < 1 || input.hours > 24 * 365) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'Suspension must be 1 hour to 1 year');
  }
  const user = await targetUser(input.userId);
  if (user.status === 'BANNED') throw new ApiError(409, 'ALREADY_BANNED', 'Already banned');
  return db.$transaction((tx) =>
    applySuspension(tx, { ...input, now: input.now ?? new Date() }, input.hours),
  );
}

/** Direct permanent ban (counts as a strike). */
export async function banUser(input: ActionInput) {
  await targetUser(input.userId);
  const action = await db.$transaction(async (tx) => {
    const a = await applyBan(tx, { ...input, now: input.now ?? new Date() });
    await resolveAutoSuspension(tx, input.userId, 'CONFIRMED'); // D74: hidden posts → removed
    return a;
  });
  await revokeAllSessions(input.userId);
  return action;
}

/**
 * Lifts a suspension or ban (status back to ACTIVE). Strikes stay on record unless
 * voided; the user's phones are un-banned only if no other banned account used them.
 */
export async function liftEnforcement(input: ActionInput) {
  const now = input.now ?? new Date();
  const user = await targetUser(input.userId);
  if (user.status !== 'BANNED' && user.status !== 'SUSPENDED') {
    throw new ApiError(409, 'NOT_RESTRICTED', 'This account isn’t suspended or banned');
  }
  return db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: input.userId },
      data: { status: 'ACTIVE', suspendedUntil: null },
    });
    await resolveAutoSuspension(tx, input.userId, 'RESTORED'); // D74: hidden posts come back
    if (user.status === 'BANNED') {
      const installs = await tx.session.findMany({
        where: { userId: input.userId, installationId: { not: null } },
        select: { installationId: true },
        distinct: ['installationId'],
      });
      for (const { installationId } of installs) {
        const otherBanned = await tx.session.findFirst({
          where: { installationId, userId: { not: input.userId }, user: { status: 'BANNED' } },
          select: { id: true },
        });
        if (!otherBanned) {
          await tx.installation.update({
            where: { id: installationId! },
            data: { bannedAt: null },
          });
        }
      }
    }
    return record(tx, { ...input, now }, 'UNBAN');
  });
}

/**
 * Cancels a strike (P5.7 appeals, or an admin correcting a mistake). If it was the
 * suspension or ban currently in force, that's lifted too.
 */
export async function voidStrike(input: {
  adminId: string;
  actionId: string;
  reason: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const a = await db.moderationAction.findUnique({ where: { id: input.actionId } });
  if (!a || !a.targetUserId || !STRIKE_ACTIONS.includes(a.action)) {
    throw new ApiError(404, 'NOT_FOUND', 'Strike not found');
  }
  if (a.voidedAt) throw new ApiError(409, 'ALREADY_VOIDED', 'Already cancelled');
  await db.moderationAction.update({
    where: { id: a.id },
    data: { voidedAt: now, voidedById: input.adminId, voidReason: input.reason },
  });
  const user = await db.user.findUniqueOrThrow({ where: { id: a.targetUserId } });
  const inForce =
    (a.action === 'BAN' && user.status === 'BANNED') ||
    (a.action === 'SUSPEND' &&
      user.status === 'SUSPENDED' &&
      user.suspendedUntil?.getTime() === a.expiresAt?.getTime());
  if (inForce) {
    await liftEnforcement({
      adminId: input.adminId,
      userId: a.targetUserId,
      reason: `Strike cancelled: ${input.reason}`,
      now,
    });
  }
}
