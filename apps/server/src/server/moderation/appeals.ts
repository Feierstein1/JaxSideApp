import type { Appeal, ModerationAction, User } from '@/generated/prisma/client';
import { getConfig } from '../config';
import { db } from '../db';
import { ApiError } from '../http';
import { enforce } from '../rate-limit';
import { activeStrikes, voidStrike } from './enforcement';

/**
 * P5.7 appeals (§11.3, D59). A person asks for one strike to be cancelled; a moderator
 * accepts (the strike is voided, lifting any suspension or ban it caused) or rejects,
 * with a note the person sees.
 *
 * Eligibility (configurable):
 * - Warnings and suspensions: within `appeals.windowDays` of the action, once.
 * - Bans: any time; after a rejection, again after `appeals.banRetryDays`.
 * - Never two open appeals for the same strike (DB index), and a daily cap per person.
 */

const DAY_MS = 86_400_000;

/** Strikes the person can see: those still counting, plus a ban in force of any age. */
async function strikesFor(user: User, now: Date) {
  const strikes = await activeStrikes(user.id, now);
  if (user.status === 'BANNED' && !strikes.some((s) => s.action === 'BAN')) {
    const ban = await db.moderationAction.findFirst({
      where: { targetUserId: user.id, action: 'BAN', voidedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    if (ban) strikes.push(ban);
  }
  return strikes;
}

type Eligibility = { canAppeal: true } | { canAppeal: false; why: string };

async function eligibility(
  strike: ModerationAction,
  appeals: Appeal[],
  now: Date,
): Promise<Eligibility> {
  const mine = appeals.filter((a) => a.actionId === strike.id);
  if (mine.some((a) => a.status === 'OPEN')) {
    return { canAppeal: false, why: 'Your appeal is waiting for review.' };
  }
  const rejected = mine.filter((a) => a.status === 'REJECTED');
  if (strike.action === 'BAN') {
    const last = rejected.at(-1);
    if (!last) return { canAppeal: true };
    const retryDays = await getConfig('appeals.banRetryDays');
    const nextAt = new Date((last.decidedAt ?? last.createdAt).getTime() + retryDays * DAY_MS);
    return nextAt <= now
      ? { canAppeal: true }
      : {
          canAppeal: false,
          why: `You can appeal again after ${nextAt.toISOString().slice(0, 10)}.`,
        };
  }
  if (rejected.length > 0) return { canAppeal: false, why: 'This appeal was already decided.' };
  const windowDays = await getConfig('appeals.windowDays');
  if (now.getTime() - strike.createdAt.getTime() > windowDays * DAY_MS) {
    return { canAppeal: false, why: `Appeals must be made within ${windowDays} days.` };
  }
  return { canAppeal: true };
}

/** What the person sees about their standing and appeals (no admin identity or notes). */
export async function standingWithAppeals(user: User, now = new Date()) {
  const [strikes, appeals, decayDays] = await Promise.all([
    strikesFor(user, now),
    db.appeal.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } }),
    getConfig('strikes.decayDays'),
  ]);
  return {
    status: user.status,
    strikes: await Promise.all(
      strikes.map(async (s) => {
        const latest = appeals.filter((a) => a.actionId === s.id).at(-1);
        const e = await eligibility(s, appeals, now);
        return {
          id: s.id,
          action: s.action,
          reason: s.reason,
          createdAt: s.createdAt.toISOString(),
          // Your own suspension end; named apart from the internal user field.
          until: s.expiresAt?.toISOString() ?? null,
          countsUntil:
            s.action === 'BAN'
              ? null
              : new Date(s.createdAt.getTime() + decayDays * DAY_MS).toISOString(),
          appeal: latest
            ? {
                status: latest.status,
                createdAt: latest.createdAt.toISOString(),
                decisionNote: latest.decisionNote,
                decidedAt: latest.decidedAt?.toISOString() ?? null,
              }
            : null,
          canAppeal: e.canAppeal,
          appealBlockedReason: e.canAppeal ? null : e.why,
        };
      }),
    ),
  };
}

export async function createAppeal(
  user: User,
  input: { actionId: string; message: string },
  now = new Date(),
) {
  await enforce(
    [
      {
        key: `appeal-day:user:${user.id}`,
        limitKey: 'rateLimit.appeal.perDay',
        windowSeconds: 86_400,
      },
    ],
    now,
  );
  const strike = (await strikesFor(user, now)).find((s) => s.id === input.actionId);
  // Someone else's strike, a voided one, or an expired one all look the same.
  if (!strike) throw new ApiError(404, 'NOT_FOUND', 'Strike not found');
  const appeals = await db.appeal.findMany({
    where: { userId: user.id, actionId: strike.id },
    orderBy: { createdAt: 'asc' },
  });
  const e = await eligibility(strike, appeals, now);
  if (!e.canAppeal) throw new ApiError(409, 'APPEAL_NOT_ALLOWED', e.why);
  try {
    await db.appeal.create({
      data: { userId: user.id, actionId: strike.id, message: input.message, createdAt: now },
    });
  } catch (err) {
    // The one-open-appeal index caught a double tap.
    if ((err as { code?: string }).code === 'P2002') {
      throw new ApiError(409, 'APPEAL_NOT_ALLOWED', 'Your appeal is waiting for review.');
    }
    throw err;
  }
}

/** For the moderation queue (P5.14). Accepting voids the strike. */
export async function decideAppeal(input: {
  adminId: string;
  appealId: string;
  accept: boolean;
  note: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const appeal = await db.appeal.findUnique({ where: { id: input.appealId } });
  if (!appeal) throw new ApiError(404, 'NOT_FOUND', 'Appeal not found');
  // Only one decision, even if two moderators click at once.
  const claimed = await db.appeal.updateMany({
    where: { id: appeal.id, status: 'OPEN' },
    data: {
      status: input.accept ? 'ACCEPTED' : 'REJECTED',
      decisionNote: input.note,
      decidedById: input.adminId,
      decidedAt: now,
    },
  });
  if (claimed.count !== 1) throw new ApiError(409, 'ALREADY_DECIDED', 'Already decided');
  if (input.accept) {
    await voidStrike({
      adminId: input.adminId,
      actionId: appeal.actionId,
      reason: `Appeal accepted: ${input.note}`,
      now,
    });
  }
}
