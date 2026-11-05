import { randomInt } from 'node:crypto';
import type { z } from 'zod';
import { DEFAULT_ENFORCEMENT_REASON, type adminBusinessStrikeSchema } from '@jax/shared';
import type { Prisma } from '@/generated/prisma/client';
import { hashPassword } from '../auth/crypto';
import { db } from '../db';
import { ApiError } from '../http';
import {
  issueBusinessStrike,
  nextBusinessStrikeStep,
  voidBusinessStrike,
} from '../moderation/business-enforcement';
import { STRIKE_ACTIONS } from '../moderation/enforcement';
import { audit } from './audit';
import { REPORTER_INCLUDE, refOf, reporterLabel } from './queue';
import { pageInfo, pageWindow, toPage } from './paging';

/**
 * B1.7 / D172: the admin portal's Businesses section (the owner of JaxSide only; no admin
 * tools on the business website). It reads and changes the business tables directly in
 * the shared database. Every change is audited.
 */

const notFound = () => new ApiError(404, 'NOT_FOUND', 'Business account not found');
const DAY = 86_400_000;

const status = (
  a: { revokedAt: Date | null; suspendedAt: Date | null; suspendedUntil: Date | null },
  now = new Date(),
) =>
  a.revokedAt
    ? 'REVOKED'
    : a.suspendedAt || (a.suspendedUntil && a.suspendedUntil > now)
      ? 'SUSPENDED'
      : 'ACTIVE';

/** D191: reports about what a business login wrote in its places' discussions. */
export const reportsAgainstBusinessWhere = (accountId: string): Prisma.ReportWhereInput => ({
  OR: [
    { businessPost: { businessAuthorId: accountId } },
    { comment: { authorBusinessId: accountId } },
    { photo: { uploaderBusinessId: accountId } }, // D195: its pictures and videos
    { ad: { accountId } }, // D209: its ads
  ],
});

/** D191: reports about a login, newest first, 20 a page, with any strike given for each. */
async function reportsAgainstBusiness(accountId: string, page: number) {
  const where = reportsAgainstBusinessWhere(accountId);
  const total = await db.report.count({ where });
  const rows = await db.report.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    ...pageWindow(page),
    include: {
      ...REPORTER_INCLUDE,
      modActions: {
        where: { targetBusinessId: accountId, action: { in: STRIKE_ACTIONS }, voidedAt: null },
        select: { action: true, createdAt: true },
        take: 1,
      },
    },
  });
  const list = rows.map((r) => {
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
  return { reports: list, reportsPage: pageInfo(toPage(list, total, page)) };
}

/** D191: every strike and note on a login, newest first (internal notes are admin-only). */
async function businessStrikes(accountId: string, page: number) {
  const where = { targetBusinessId: accountId };
  const [rows, total] = await Promise.all([
    db.moderationAction.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...pageWindow(page),
      include: { admin: { select: { username: true } } },
    }),
    db.moderationAction.count({ where }),
  ]);
  const list = rows.map((m) => ({
    id: m.id,
    action: m.action,
    reason: m.reason,
    internalNote: m.internalNote,
    durationHours: m.durationHours,
    expiresAt: m.expiresAt?.toISOString() ?? null,
    reportId: m.reportId,
    by: m.admin.username,
    createdAt: m.createdAt.toISOString(),
    voidedAt: m.voidedAt?.toISOString() ?? null,
    voidReason: m.voidReason,
  }));
  return { strikes: list, strikesPage: pageInfo(toPage(list, total, page)) };
}

/** Owner accounts (employees are listed on their owner's page), newest first, 20 a page. */
export async function listBusinesses(q: string, page = 1) {
  const term = q.trim().toLowerCase();
  const where = {
    createdById: null,
    ...(term
      ? {
          OR: [
            { email: { contains: term } },
            {
              placeAccess: {
                some: { place: { nameNormalized: { contains: term } } },
              },
            },
          ],
        }
      : {}),
  } satisfies Prisma.BusinessAccountWhereInput;
  const [rows, total] = await Promise.all([
    db.businessAccount.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...pageWindow(page),
      include: {
        placeAccess: {
          where: { revokedAt: null },
          include: { place: { select: { id: true, name: true } } },
        },
        _count: { select: { employees: true } },
        sessions: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
        subscriptions: {
          where: { status: 'ACTIVE' },
          include: { plan: { select: { name: true } } },
        },
      },
    }),
    db.businessAccount.count({ where }),
  ]);
  const list = rows.map((a) => ({
    id: a.id,
    email: a.email ?? '',
    status: status(a),
    createdAt: a.createdAt.toISOString(),
    lastSignInAt: a.sessions[0]?.createdAt.toISOString() ?? null,
    places: a.placeAccess.map((p) => ({ id: p.place.id, name: p.place.name, role: p.role })),
    employees: a._count.employees,
    plan: a.subscriptions[0]
      ? { name: a.subscriptions[0].plan.name, comped: a.subscriptions[0].comped }
      : null,
  }));
  return toPage(list, total, page);
}

/** Everything about one business account (an owner, or an employee with a link to its owner). */
export async function getBusiness(
  id: string,
  opts: { strikesPage?: number; reportsPage?: number } = {},
  now = new Date(),
) {
  const a = await db.businessAccount.findUnique({
    where: { id },
    include: {
      createdBy: { select: { id: true, email: true } },
      placeAccess: {
        orderBy: { createdAt: 'asc' },
        include: {
          place: { select: { id: true, name: true, address: true, status: true } },
          ownerClaim: {
            select: {
              id: true,
              status: true,
              method: true,
              verifiedAt: true,
              user: { select: { id: true, username: true, status: true } },
            },
          },
        },
      },
      employees: {
        orderBy: { createdAt: 'asc' },
        include: {
          placeAccess: {
            where: { revokedAt: null },
            include: { place: { select: { name: true } } },
          },
          sessions: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
        },
      },
      sessions: { orderBy: { createdAt: 'desc' }, take: 1, select: { createdAt: true } },
      invitesUsed: { select: { id: true, usedAt: true, place: { select: { name: true } } } },
      subscriptions: {
        orderBy: { createdAt: 'desc' },
        include: { plan: { select: { name: true, liveAdLimit: true } } },
      },
      _count: { select: { ads: true } },
    },
  });
  if (!a) throw notFound();

  // The business is the owner and every login it made.
  const ownerId = a.createdById ?? a.id;
  const logins = [
    ownerId,
    ...(
      await db.businessAccount.findMany({
        where: { createdById: ownerId },
        select: { id: true },
      })
    ).map((e) => e.id),
  ];
  const since = new Date(now.getTime() - 30 * DAY);
  const [activeSessions, posts30, replies30, recentPosts, recentReplies] = await Promise.all([
    db.businessSession.count({
      where: { accountId: { in: logins }, revokedAt: null, expiresAt: { gt: now } },
    }),
    db.businessPost.count({
      where: { businessAuthorId: { in: logins }, createdAt: { gte: since } },
    }),
    db.comment.count({ where: { authorBusinessId: { in: logins }, createdAt: { gte: since } } }),
    db.businessPost.findMany({
      where: { businessAuthorId: { in: logins } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        body: true,
        status: true,
        createdAt: true,
        place: { select: { name: true } },
        businessAuthor: { select: { email: true, username: true } },
      },
    }),
    db.comment.findMany({
      where: { authorBusinessId: { in: logins } },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true,
        body: true,
        status: true,
        createdAt: true,
        businessPost: { select: { id: true, place: { select: { name: true } } } },
        authorBusiness: { select: { email: true, username: true } },
      },
    }),
  ]);
  const login = (x: { email: string | null; username: string | null } | null) =>
    x?.username ?? x?.email ?? '';

  return {
    id: a.id,
    signInName: a.username ?? a.email ?? '',
    kind: a.createdById ? ('employee' as const) : ('owner' as const),
    owner: a.createdBy ? { id: a.createdBy.id, email: a.createdBy.email ?? '' } : null,
    status: status(a, now),
    suspendedUntil:
      a.suspendedUntil && a.suspendedUntil > now ? a.suspendedUntil.toISOString() : null,
    createdAt: a.createdAt.toISOString(),
    lastSignInAt: a.sessions[0]?.createdAt.toISOString() ?? null,
    activeSessions,
    // D189: through the admin route (it serves removed pictures too, for moderation).
    avatarUrl: a.avatarMediaId ? `/api/v1/admin/business-pictures/${a.avatarMediaId}` : null,
    // D191: strikes on this login, what the next one does, and the reports about it.
    ...(await businessStrikes(a.id, opts.strikesPage ?? 1)),
    nextStrike: await nextBusinessStrikeStep(a.id, a.revokedAt !== null),
    ...(await reportsAgainstBusiness(a.id, opts.reportsPage ?? 1)),
    twoFactorOn: a.totpEnabledAt !== null,
    mustChangePassword: a.mustChangePassword,
    lockedUntil: a.lockedUntil && a.lockedUntil > now ? a.lockedUntil.toISOString() : null,
    places: a.placeAccess.map((p) => ({
      placeId: p.place.id,
      name: p.place.name,
      address: p.place.address,
      placeStatus: p.place.status,
      role: p.role,
      staffName: p.staffName,
      since: p.createdAt.toISOString(),
      revokedAt: p.revokedAt?.toISOString() ?? null,
      claim: p.ownerClaim
        ? {
            id: p.ownerClaim.id,
            status: p.ownerClaim.status,
            method: p.ownerClaim.method,
            verifiedAt: p.ownerClaim.verifiedAt?.toISOString() ?? null,
            appUser: p.ownerClaim.user,
          }
        : null,
    })),
    team: a.employees.map((e) => ({
      id: e.id,
      username: e.username ?? '',
      status: status(e, now),
      mustChangePassword: e.mustChangePassword,
      lastSignInAt: e.sessions[0]?.createdAt.toISOString() ?? null,
      places: e.placeAccess.map((p) => ({
        name: p.place.name,
        role: p.role,
        staffName: p.staffName,
      })),
    })),
    invitesUsed: a.invitesUsed.map((i) => ({
      id: i.id,
      place: i.place.name,
      usedAt: i.usedAt?.toISOString() ?? null,
    })),
    subscriptions: a.subscriptions.map((s) => ({
      id: s.id,
      plan: s.plan.name,
      liveAdLimit: s.plan.liveAdLimit,
      status: s.status,
      comped: s.comped,
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt?.toISOString() ?? null,
    })),
    adCount: a._count.ads,
    activity: {
      posts30,
      replies30,
      recent: [
        ...recentPosts.map((p) => ({
          kind: 'post' as const,
          id: p.id,
          postId: p.id,
          place: p.place.name,
          body: p.body.slice(0, 200),
          status: p.status,
          by: login(p.businessAuthor),
          createdAt: p.createdAt.toISOString(),
        })),
        ...recentReplies.map((c) => ({
          kind: 'reply' as const,
          id: c.id,
          postId: c.businessPost?.id ?? '',
          place: c.businessPost?.place.name ?? '',
          body: c.body.slice(0, 200),
          status: c.status,
          by: login(c.authorBusiness),
          createdAt: c.createdAt.toISOString(),
        })),
      ]
        .sort((x, y) => y.createdAt.localeCompare(x.createdAt))
        .slice(0, 10),
    },
  };
}

// ───────────────────────────── Changes ─────────────────────────────

/** 12 random letters and digits in three groups, without look-alikes (same as the business site). */
export function temporaryPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const group = () =>
    Array.from({ length: 4 }, () => alphabet[randomInt(alphabet.length)]).join('');
  return `${group()}-${group()}-${group()}`;
}

/** The account, plus (for an owner) every login it made: what a suspension or revoke covers. */
async function scope(tx: Prisma.TransactionClient, id: string) {
  const a = await tx.businessAccount.findUnique({ where: { id } });
  if (!a) throw notFound();
  const ids = [a.id];
  if (!a.createdById) {
    const employees = await tx.businessAccount.findMany({
      where: { createdById: a.id },
      select: { id: true },
    });
    ids.push(...employees.map((e) => e.id));
  }
  return { account: a, ids };
}

export type BusinessAction =
  'suspend' | 'unsuspend' | 'revoke' | 'reset-password' | 'remove-picture';

/**
 * Suspend (sign-in refused, sessions end; lifts again), revoke (permanent: the logins and
 * their place access end) or reset a password (a temporary one, shown once to the admin).
 * For an owner, suspend and revoke cover the whole business: its employee logins too.
 * Unsuspend also ends a strike's suspension (D191). Remove picture (D189) takes down this
 * login's profile picture (kept in storage as evidence, never shown again).
 */
export async function actOnBusiness(
  adminId: string,
  id: string,
  action: BusinessAction,
  note: string | undefined,
  now = new Date(),
): Promise<{ temporaryPassword: string | null }> {
  let password: string | null = null;
  await db.$transaction(async (tx) => {
    const { account, ids } = await scope(tx, id);
    if (account.revokedAt) throw new ApiError(409, 'REVOKED', 'This account was revoked.');
    const endSessions = () =>
      tx.businessSession.updateMany({
        where: { accountId: { in: ids }, revokedAt: null },
        data: { revokedAt: now },
      });
    switch (action) {
      case 'suspend':
        await tx.businessAccount.updateMany({
          where: { id: { in: ids }, suspendedAt: null, revokedAt: null },
          data: { suspendedAt: now },
        });
        await endSessions();
        break;
      case 'unsuspend':
        await tx.businessAccount.updateMany({
          where: { id: { in: ids }, revokedAt: null },
          data: { suspendedAt: null, suspendedUntil: null },
        });
        break;
      case 'remove-picture': {
        if (!account.avatarMediaId) {
          throw new ApiError(409, 'NO_PICTURE', 'This login has no profile picture.');
        }
        await tx.adMedia.update({
          where: { id: account.avatarMediaId },
          data: { status: 'REMOVED', removedAt: now },
        });
        await tx.businessAccount.update({
          where: { id: account.id },
          data: { avatarMediaId: null },
        });
        break;
      }
      case 'revoke':
        await tx.businessAccount.updateMany({
          where: { id: { in: ids }, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.businessPlaceAccess.updateMany({
          where: { accountId: { in: ids }, revokedAt: null },
          data: { revokedAt: now },
        });
        await endSessions();
        break;
      case 'reset-password':
        password = temporaryPassword();
        // Only this login (not the whole business). Also clears a lockout and two-step sign-in.
        await tx.businessAccount.update({
          where: { id: account.id },
          data: {
            passwordHash: await hashPassword(password),
            mustChangePassword: true,
            failedLogins: 0,
            lockedUntil: null,
            totpEnabledAt: null,
            totpSecretEnc: null,
            totpLastStep: null,
          },
        });
        await tx.businessSession.updateMany({
          where: { accountId: account.id, revokedAt: null },
          data: { revokedAt: now },
        });
        break;
    }
    await audit(
      adminId,
      `BUSINESS_${action.toUpperCase().replace('-', '_')}`,
      { type: 'business-account', id: account.id },
      { logins: ids.length, ...(note ? { note } : {}) },
      tx,
    );
  });
  return { temporaryPassword: password };
}

/**
 * Moves a place to another owner account (for example after a sale, or when the wrong
 * person set it up). The old owner loses the place; with `removeOldTeam`, so do the
 * employee logins it made there.
 */
export async function moveBusinessOwner(
  adminId: string,
  placeId: string,
  input: { toEmail: string; removeOldTeam: boolean; note?: string },
  now = new Date(),
) {
  await db.$transaction(async (tx) => {
    const target = await tx.businessAccount.findUnique({ where: { email: input.toEmail } });
    if (!target || target.createdById || target.revokedAt) {
      throw new ApiError(
        404,
        'NOT_FOUND',
        'No owner account uses that email (it must be an owner’s business account, not a staff login).',
      );
    }
    const current = await tx.businessPlaceAccess.findFirst({
      where: { placeId, role: 'OWNER', revokedAt: null },
    });
    if (current?.accountId === target.id) {
      throw new ApiError(409, 'ALREADY_OWNER', 'That account already owns this place.');
    }
    const place = await tx.businessPlace.findUnique({
      where: { id: placeId },
      select: { id: true },
    });
    if (!place) throw new ApiError(404, 'NOT_FOUND', 'Place not found');
    if (current) {
      await tx.businessPlaceAccess.update({ where: { id: current.id }, data: { revokedAt: now } });
      if (input.removeOldTeam) {
        await tx.businessPlaceAccess.updateMany({
          where: { placeId, revokedAt: null, account: { createdById: current.accountId } },
          data: { revokedAt: now },
        });
      }
    }
    // The new owner may have worked there already (say, as a Manager): that access ends.
    await tx.businessPlaceAccess.updateMany({
      where: { placeId, accountId: target.id, revokedAt: null },
      data: { revokedAt: now },
    });
    await tx.businessPlaceAccess.create({
      data: { accountId: target.id, placeId, role: 'OWNER', createdAt: now },
    });
    // B1.8: both businesses hear about it in their inbox.
    const name = (await tx.businessPlace.findUniqueOrThrow({ where: { id: placeId } })).name;
    await tx.businessNotice.create({
      data: {
        accountId: target.id,
        placeId,
        kind: 'PLACE_ADDED',
        title: `${name} was added to your account`,
        body: 'JaxSide moved this place to your business account. You are its Owner.',
        link: `/places/${placeId}`,
        createdAt: now,
      },
    });
    if (current) {
      await tx.businessNotice.create({
        data: {
          accountId: current.accountId,
          kind: 'PLACE_REMOVED',
          title: `${name} was moved to another business account`,
          body: 'JaxSide moved this place to another owner. Contact JaxSide if you think this is a mistake.',
          createdAt: now,
        },
      });
    }
    await audit(
      adminId,
      'BUSINESS_MOVE_OWNER',
      { type: 'place', id: placeId },
      {
        from: current?.accountId ?? null,
        to: target.id,
        removeOldTeam: input.removeOldTeam,
        ...(input.note ? { note: input.note } : {}),
      },
      tx,
    );
  });
}

/**
 * D191: a strike on a business login (with `reportId`, "Notify" from a report about what
 * it wrote: that report must be about this login and gets at most one standing strike),
 * or cancelling one.
 */
export async function businessStrikeAction(
  adminId: string,
  accountId: string,
  input: z.infer<typeof adminBusinessStrikeSchema>,
) {
  let result: unknown = null;
  // D196: a strike may come without a reason.
  const reason = input.reason ?? DEFAULT_ENFORCEMENT_REASON;
  if (input.action === 'strike') {
    if (input.reportId) {
      const report = await db.report.findFirst({
        where: { id: input.reportId, ...reportsAgainstBusinessWhere(accountId) },
        select: {
          modActions: {
            where: { targetBusinessId: accountId, action: { in: STRIKE_ACTIONS }, voidedAt: null },
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
    result = await issueBusinessStrike({
      adminId,
      accountId,
      reason,
      internalNote: input.internalNote,
      reportId: input.reportId,
    });
  } else {
    await voidBusinessStrike({
      adminId,
      accountId,
      actionId: input.strikeId,
      reason,
    });
  }
  await audit(
    adminId,
    `BUSINESS_${input.action.toUpperCase()}`,
    { type: 'business-account', id: accountId },
    {
      reason,
      ...(input.action === 'strike' && input.reportId ? { reportId: input.reportId } : {}),
      ...(input.action === 'void' ? { strikeId: input.strikeId } : {}),
    },
  );
  return result;
}
