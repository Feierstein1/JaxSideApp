import type { ModerationActionType, Prisma } from '@/generated/prisma/client';
import { getConfig } from '../config';
import { db } from '../db';
import { ApiError } from '../http';
import { STRIKE_ACTIONS, type StrikeOutcome } from './enforcement';

/**
 * D191: strikes for business logins (the owner website). Same ladder and settings as
 * people (D9: warning, `strikes.firstSuspensionHours`, `strikes.secondSuspensionHours`,
 * ban at `strikes.banAtStrike`; strikes stop counting after `strikes.decayDays`), but
 * per login: the strike goes to the login that wrote the content. Given from the admin
 * portal only. Each strike sends a STRIKE notice to that login's bell on the website, and
 * a copy to its Owner when it's an employee.
 *
 * A suspension sets `suspendedUntil` (the website refuses sign-in until then) and ends
 * the login's sessions. A ban revokes the login and its place access; for an Owner, the
 * whole business (its employee logins too), like the portal's Revoke. A revoked login's
 * Google account stays on it (`googleSub` is unique), so it can't verify again.
 */

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;
/** The website's page listing a login's strikes. */
export const STANDING_LINK = '/account/standing';

export interface BusinessActionInput {
  adminId: string;
  accountId: string;
  /** Shown to the business (keep it factual). */
  reason: string;
  /** Internal only; never shown to the business. */
  internalNote?: string;
  reportId?: string;
  now?: Date;
}

/** Strikes on a login that still count: not voided and inside the decay window. */
export async function activeBusinessStrikes(accountId: string, now = new Date()) {
  const decayDays = await getConfig('strikes.decayDays');
  return db.moderationAction.findMany({
    where: {
      targetBusinessId: accountId,
      action: { in: STRIKE_ACTIONS },
      voidedAt: null,
      createdAt: { gt: new Date(now.getTime() - decayDays * DAY_MS) },
    },
    orderBy: { createdAt: 'asc' },
  });
}

/** What the next strike on this login would do (D9), or null once it's revoked. */
export async function nextBusinessStrikeStep(accountId: string, revoked: boolean) {
  if (revoked) return null;
  const [strikes, first, second, banAt] = await Promise.all([
    activeBusinessStrikes(accountId),
    getConfig('strikes.firstSuspensionHours'),
    getConfig('strikes.secondSuspensionHours'),
    getConfig('strikes.banAtStrike'),
  ]);
  const n = strikes.length + 1;
  if (n >= banAt) return { action: 'BAN' as const, strike: n };
  if (n === 1) return { action: 'WARN' as const, strike: n };
  return { action: 'SUSPEND' as const, strike: n, hours: n === 2 ? first : second };
}

function stepTitle(outcome: StrikeOutcome) {
  if (outcome.action === 'WARN') return 'Warning from JaxSide';
  if (outcome.action === 'BAN') return 'Your login was closed by JaxSide';
  const h = outcome.hours;
  return `Suspended for ${h % 24 === 0 ? `${h / 24} day${h === 24 ? '' : 's'}` : `${h} hours`}`;
}

async function record(
  tx: Prisma.TransactionClient,
  input: BusinessActionInput,
  action: ModerationActionType,
  extra: { durationHours?: number; expiresAt?: Date } = {},
) {
  return tx.moderationAction.create({
    data: {
      adminId: input.adminId,
      targetBusinessId: input.accountId,
      action,
      reason: input.reason,
      internalNote: input.internalNote ?? null,
      reportId: input.reportId ?? null,
      durationHours: extra.durationHours ?? null,
      expiresAt: extra.expiresAt ?? null,
      createdAt: input.now,
    },
  });
}

/** The place a report is about (for the notice), if it's about a place's discussion. */
async function reportPlace(tx: Prisma.TransactionClient, reportId: string | undefined) {
  if (!reportId) return null;
  const r = await tx.report.findUnique({
    where: { id: reportId },
    select: {
      businessPost: { select: { placeId: true } },
      comment: { select: { businessPost: { select: { placeId: true } } } },
    },
  });
  return r?.businessPost?.placeId ?? r?.comment?.businessPost?.placeId ?? null;
}

/** Adds a strike to a business login and applies the next step of the ladder. */
export async function issueBusinessStrike(input: BusinessActionInput): Promise<StrikeOutcome> {
  const now = input.now ?? new Date();
  const withNow = { ...input, now };
  const account = await db.businessAccount.findUnique({ where: { id: input.accountId } });
  if (!account) throw new ApiError(404, 'NOT_FOUND', 'Business account not found');
  if (account.revokedAt) throw new ApiError(409, 'REVOKED', 'This account was revoked.');
  const [strikes, first, second, banAt] = await Promise.all([
    activeBusinessStrikes(input.accountId, now),
    getConfig('strikes.firstSuspensionHours'),
    getConfig('strikes.secondSuspensionHours'),
    getConfig('strikes.banAtStrike'),
  ]);
  const strike = strikes.length + 1;
  const outcome: StrikeOutcome =
    strike >= banAt
      ? { action: 'BAN', strike }
      : strike === 1
        ? { action: 'WARN', strike }
        : {
            action: 'SUSPEND',
            strike,
            hours: strike === 2 ? first : second,
            until: new Date(now.getTime() + (strike === 2 ? first : second) * HOUR_MS),
          };

  await db.$transaction(async (tx) => {
    // An Owner's ban covers the logins it made; an employee's covers only itself.
    const ids =
      outcome.action === 'BAN' && !account.createdById
        ? [
            account.id,
            ...(
              await tx.businessAccount.findMany({
                where: { createdById: account.id },
                select: { id: true },
              })
            ).map((e) => e.id),
          ]
        : [account.id];
    const endSessions = () =>
      tx.businessSession.updateMany({
        where: { accountId: { in: ids }, revokedAt: null },
        data: { revokedAt: now },
      });
    if (outcome.action === 'WARN') {
      await record(tx, withNow, 'WARN');
    } else if (outcome.action === 'SUSPEND') {
      // Never shortens a longer suspension already in force.
      if (!account.suspendedUntil || account.suspendedUntil < outcome.until) {
        await tx.businessAccount.update({
          where: { id: account.id },
          data: { suspendedUntil: outcome.until },
        });
      }
      await endSessions();
      await record(tx, withNow, 'SUSPEND', {
        durationHours: outcome.hours,
        expiresAt: outcome.until,
      });
    } else {
      await tx.businessAccount.updateMany({
        where: { id: { in: ids }, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.businessPlaceAccess.updateMany({
        where: { accountId: { in: ids }, revokedAt: null },
        data: { revokedAt: now },
      });
      await endSessions();
      await record(tx, withNow, 'BAN');
    }

    const placeId = await reportPlace(tx, input.reportId);
    const notice = {
      kind: 'STRIKE' as const,
      placeId,
      title: stepTitle(outcome),
      body: input.reason.slice(0, 500),
      link: STANDING_LINK,
      createdAt: now,
    };
    await tx.businessNotice.create({ data: { ...notice, accountId: account.id } });
    if (account.createdById) {
      const who = account.username ?? account.email ?? 'An employee';
      await tx.businessNotice.create({
        data: {
          ...notice,
          accountId: account.createdById,
          title: `${who}: ${notice.title}`.slice(0, 120),
        },
      });
    }
  });
  return outcome;
}

/**
 * Cancels a warning or suspension strike on a business login (e.g. after they contact
 * JaxSide). A cancelled suspension ends unless another one still stands. A ban revoked the
 * login and can't be undone here.
 */
export async function voidBusinessStrike(input: {
  adminId: string;
  accountId: string;
  actionId: string;
  reason: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const a = await db.moderationAction.findUnique({ where: { id: input.actionId } });
  if (!a || a.targetBusinessId !== input.accountId || !STRIKE_ACTIONS.includes(a.action)) {
    throw new ApiError(404, 'NOT_FOUND', 'Strike not found');
  }
  if (a.voidedAt) throw new ApiError(409, 'ALREADY_VOIDED', 'Already cancelled');
  if (a.action === 'BAN') {
    throw new ApiError(409, 'BAN_FINAL', 'A ban closed the login; it can’t be cancelled');
  }
  await db.$transaction(async (tx) => {
    await tx.moderationAction.update({
      where: { id: a.id },
      data: { voidedAt: now, voidedById: input.adminId, voidReason: input.reason },
    });
    if (a.action === 'SUSPEND') {
      const still = await tx.moderationAction.findFirst({
        where: {
          targetBusinessId: input.accountId,
          action: 'SUSPEND',
          voidedAt: null,
          expiresAt: { gt: now },
        },
        orderBy: { expiresAt: 'desc' },
      });
      await tx.businessAccount.update({
        where: { id: input.accountId },
        data: { suspendedUntil: still?.expiresAt ?? null },
      });
    }
  });
}
