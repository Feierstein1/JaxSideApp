import type { z } from 'zod';
import { DEFAULT_ENFORCEMENT_REASON, type userActionSchema } from '@jax/shared';
import { normalizeUsername } from '@jax/shared';
import { Prisma } from '@/generated/prisma/client';
import { getConfig } from '../config';
import { db } from '../db';
import { ApiError } from '../http';
import { enforce } from '../rate-limit';
import {
  STRIKE_ACTIONS,
  activeStrikes,
  banUser,
  issueStrike,
  liftEnforcement,
  suspendUser,
  voidStrike,
} from '../moderation/enforcement';
import { audit } from './audit';
import { pageWindow, toPage } from './paging';
import { REPORTER_INCLUDE, refOf, reporterLabel, reportsAgainstWhere, userHistory } from './queue';

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

export const USERS_PAGE_SIZE = 20;
export const USER_FILTERS = ['strikes', 'banned', 'suspended', 'all'] as const;
export type UserFilter = (typeof USER_FILTERS)[number];

const STRIKE_SQL = Prisma.sql`m.action IN ('WARN', 'SUSPEND', 'BAN') AND m."voidedAt" IS NULL`;

/** Lower-cased search text with LIKE's wildcards escaped (usernames often contain `_`). */
const likeTerm = (q: string) =>
  normalizeUsername(q.replace(/^\s*@/, '')).replace(/[\\%_]/g, '\\$&');

/**
 * The Users page: any part of a username, filtered to people with strikes (the default),
 * banned, suspended, or everyone; 20 per page. Strikes are ones not cancelled; "counting"
 * are the ones still inside the decay window (they set the next step of the ladder).
 */
export async function listUsers(opts: { q?: string; filter?: UserFilter; page?: number } = {}) {
  const term = likeTerm((opts.q ?? '').slice(0, 40));
  const filter = opts.filter ?? 'strikes';
  const page = Math.max(1, Math.floor(opts.page ?? 1));
  const skip = (page - 1) * USERS_PAGE_SIZE;
  let ids: string[];
  let total: number;
  if (filter === 'strikes') {
    // Most recent strike first.
    const name = term ? Prisma.sql`AND u."usernameNormalized" LIKE ${`%${term}%`}` : Prisma.empty;
    const [rows, counted] = await Promise.all([
      db.$queryRaw<{ id: string }[]>`
        SELECT u.id FROM "ModerationAction" m JOIN "User" u ON u.id = m."targetUserId"
        WHERE ${STRIKE_SQL} ${name}
        GROUP BY u.id ORDER BY max(m."createdAt") DESC, u.id
        LIMIT ${USERS_PAGE_SIZE} OFFSET ${skip}`,
      db.$queryRaw<{ n: bigint }[]>`
        SELECT count(DISTINCT u.id) AS n FROM "ModerationAction" m JOIN "User" u ON u.id = m."targetUserId"
        WHERE ${STRIKE_SQL} ${name}`,
    ]);
    ids = rows.map((r) => r.id);
    total = Number(counted[0]?.n ?? 0);
  } else {
    const where: Prisma.UserWhereInput = {
      ...(term ? { usernameNormalized: { contains: term } } : {}),
      ...(filter === 'banned' ? { status: 'BANNED' as const } : {}),
      ...(filter === 'suspended' ? { status: 'SUSPENDED' as const } : {}),
    };
    const [rows, n] = await Promise.all([
      db.user.findMany({
        where,
        orderBy: term ? { usernameNormalized: 'asc' } : { createdAt: 'desc' },
        skip,
        take: USERS_PAGE_SIZE,
        select: { id: true },
      }),
      db.user.count({ where }),
    ]);
    ids = rows.map((r) => r.id);
    total = n;
  }
  const decayDays = await getConfig('strikes.decayDays');
  const strikeWhere = {
    targetUserId: { in: ids },
    action: { in: STRIKE_ACTIONS },
    voidedAt: null,
  };
  const [users, strikes, counting] = await Promise.all([
    db.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        username: true,
        status: true,
        role: true,
        suspendedUntil: true,
        createdAt: true,
      },
    }),
    db.moderationAction.groupBy({
      by: ['targetUserId'],
      where: strikeWhere,
      _count: { _all: true },
      _max: { createdAt: true },
    }),
    db.moderationAction.groupBy({
      by: ['targetUserId'],
      where: { ...strikeWhere, createdAt: { gt: new Date(Date.now() - decayDays * 86_400_000) } },
      _count: { _all: true },
    }),
  ]);
  const byId = new Map(users.map((u) => [u.id, u]));
  const all = new Map(strikes.map((s) => [s.targetUserId, s]));
  const live = new Map(counting.map((s) => [s.targetUserId, s._count._all]));
  return {
    page,
    pageSize: USERS_PAGE_SIZE,
    total,
    pages: Math.max(1, Math.ceil(total / USERS_PAGE_SIZE)),
    users: ids.flatMap((id) => {
      const u = byId.get(id);
      if (!u) return [];
      const s = all.get(id);
      return [
        {
          id: u.id,
          username: u.username,
          status: u.status,
          role: u.role,
          suspendedUntil: u.suspendedUntil?.toISOString() ?? null,
          createdAt: u.createdAt.toISOString(),
          strikes: s?._count._all ?? 0,
          countingStrikes: live.get(id) ?? 0,
          lastStrikeAt: s?._max.createdAt?.toISOString() ?? null,
        },
      ];
    }),
  };
}

/** Accounts created today, this week (from Monday), this month and ever, in Jacksonville time. */
export async function signupCounts(now = new Date()) {
  const [r] = await db.$queryRaw<{ today: bigint; week: bigint; month: bigint; total: bigint }[]>`
    WITH t AS (SELECT ${now}::timestamptz AT TIME ZONE 'America/New_York' AS local)
    SELECT
      count(*) FILTER (WHERE u."createdAt" >= date_trunc('day', t.local) AT TIME ZONE 'America/New_York') AS today,
      count(*) FILTER (WHERE u."createdAt" >= date_trunc('week', t.local) AT TIME ZONE 'America/New_York') AS week,
      count(*) FILTER (WHERE u."createdAt" >= date_trunc('month', t.local) AT TIME ZONE 'America/New_York') AS month,
      count(*) AS total
    FROM "User" u, t
    WHERE u."createdAt" <= ${now}::timestamptz`;
  return {
    today: Number(r?.today ?? 0),
    week: Number(r?.week ?? 0),
    month: Number(r?.month ?? 0),
    total: Number(r?.total ?? 0),
  };
}

/**
 * Reports about a person, newest first, 20 a page (D210), each with a link to its case and
 * whether a strike was already given for it ("Notify" is a strike tied to the report).
 */
export async function reportsAgainstUser(userId: string, page = 1) {
  const rows = await db.report.findMany({
    where: reportsAgainstWhere(userId),
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...pageWindow(page),
    include: {
      ...REPORTER_INCLUDE,
      modActions: {
        where: { targetUserId: userId, action: { in: STRIKE_ACTIONS }, voidedAt: null },
        select: { action: true, createdAt: true },
        take: 1,
      },
    },
  });
  return rows.map((r) => {
    const ref = refOf(r);
    const strike = r.modActions[0];
    return {
      id: r.id,
      reason: r.reason,
      details: r.details,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
      reporter: reporterLabel(r),
      caseHref: ref ? `/admin/cases/${ref.type}/${ref.id}` : null,
      what: ref?.type ?? null,
      strike: strike ? { action: strike.action, createdAt: strike.createdAt.toISOString() } : null,
    };
  });
}

/** What "Strike" or "Notify" would do next on the ladder (D9), or null if banned. */
async function nextStrikeStep(userId: string, status: string) {
  if (status === 'BANNED' || status === 'DELETED') return null;
  const [strikes, first, second, banAt] = await Promise.all([
    activeStrikes(userId),
    getConfig('strikes.firstSuspensionHours'),
    getConfig('strikes.secondSuspensionHours'),
    getConfig('strikes.banAtStrike'),
  ]);
  const n = strikes.length + 1;
  if (n >= banAt) return { action: 'BAN' as const, strike: n };
  if (n === 1) return { action: 'WARN' as const, strike: n };
  return { action: 'SUSPEND' as const, strike: n, hours: n === 2 ? first : second };
}

export async function getUserRecord(
  userId: string,
  opts: { reportsPage?: number; historyPage?: number } = {},
) {
  const u = await db.user.findUnique({
    where: { id: userId },
    include: {
      profile: true,
      usernameHistory: { orderBy: { changedAt: 'desc' }, take: 20 },
    },
  });
  if (!u) throw new ApiError(404, 'NOT_FOUND', 'User not found');
  const [posts, comments, reports, nextStrike] = await Promise.all([
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
    reportsAgainstUser(userId, opts.reportsPage),
    nextStrikeStep(userId, u.status),
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
    color: u.profile?.color ?? 'teal',
    // Through the admin photo route (it serves removed photos too, for moderation).
    avatarUrl: u.profile?.avatarPhotoId ? `/api/v1/admin/photos/${u.profile.avatarPhotoId}` : null,
    previousUsernames: u.usernameHistory.map((h) => ({
      username: h.username,
      changedAt: h.changedAt.toISOString(),
    })),
    recentPosts: posts.map((p) => ({ ...p, createdAt: p.createdAt.toISOString() })),
    recentComments: comments.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
    reports,
    nextStrike,
    history: await userHistory(userId, opts.historyPage),
  };
}

/**
 * "Notify" from a report: the report must be about this person (someone else's report
 * looks the same as a missing one), and gets at most one strike that still stands.
 */
async function checkReportForStrike(userId: string, reportId: string) {
  const report = await db.report.findFirst({
    where: { id: reportId, ...reportsAgainstWhere(userId) },
    select: {
      modActions: {
        where: { targetUserId: userId, action: { in: STRIKE_ACTIONS }, voidedAt: null },
        select: { id: true },
        take: 1,
      },
    },
  });
  if (!report) throw new ApiError(404, 'NOT_FOUND', 'Report not found');
  if (report.modActions.length) {
    throw new ApiError(409, 'ALREADY_NOTIFIED', 'They already have a strike for this report');
  }
}

export async function userAction(
  adminId: string,
  userId: string,
  input: z.infer<typeof userActionSchema>,
) {
  // D196: strikes, suspensions and bans may come without a reason.
  const reason = input.reason ?? DEFAULT_ENFORCEMENT_REASON;
  const base = { adminId, userId, reason };
  const note = 'internalNote' in input ? input.internalNote : undefined;
  let result: unknown = null;
  switch (input.action) {
    case 'strike':
      if (input.reportId) await checkReportForStrike(userId, input.reportId);
      result = await issueStrike({ ...base, internalNote: note, reportId: input.reportId });
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
          reason,
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
      await voidStrike({ adminId, actionId: input.strikeId, reason });
      break;
    }
  }
  await audit(
    adminId,
    `USER_${input.action.toUpperCase()}`,
    { type: 'user', id: userId },
    {
      reason,
      ...(input.action === 'suspend' ? { hours: input.hours } : {}),
      ...(input.action === 'strike' && input.reportId ? { reportId: input.reportId } : {}),
      ...(input.action === 'staffBadge' ? { on: input.on } : {}),
    },
  );
  return result;
}

/** Appeals (waiting ones oldest first), 20 a page (D210). */
export async function listAppeals(status: 'OPEN' | 'ACCEPTED' | 'REJECTED' = 'OPEN', page = 1) {
  const [rows, total] = await Promise.all([
    db.appeal.findMany({
      where: { status },
      orderBy: [{ createdAt: status === 'OPEN' ? 'asc' : 'desc' }, { id: 'asc' }],
      ...pageWindow(page),
      include: {
        user: { select: { id: true, username: true, status: true } },
        action: { select: { action: true, reason: true, createdAt: true, internalNote: true } },
      },
    }),
    db.appeal.count({ where: { status } }),
  ]);
  const list = rows.map((a) => ({
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
  return toPage(list, total, page);
}

/** The Users page's query string (`q`, `filter`, `page`); anything unknown falls back. */
export function parseUserQuery(params: { get(name: string): string | null }) {
  const filter = params.get('filter');
  const page = Number(params.get('page'));
  return {
    q: (params.get('q') ?? '').slice(0, 40),
    filter: (USER_FILTERS as readonly string[]).includes(filter ?? '')
      ? (filter as UserFilter)
      : 'strikes',
    page: Number.isInteger(page) && page >= 1 && page <= 10_000 ? page : 1,
  };
}
