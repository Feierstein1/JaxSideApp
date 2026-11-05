import { randomInt } from 'node:crypto';
import type { z } from 'zod';
import type {
  GiveawayWinView,
  giveawayActionSchema,
  giveawayCreateSchema,
  giveawayWinnerActionSchema,
} from '@jax/shared';
import { normalizeUsername } from '@jax/shared';
import { Prisma, type Giveaway, type GiveawayWinnerStatus } from '@/generated/prisma/client';
import { audit } from './admin/audit';
import { getConfig } from './config';
import { decryptUserEmail } from './crypto/field-encryption';
import { db } from './db';
import { ApiError } from './http';
import { enforce } from './rate-limit';
import { ADMIN_PAGE_SIZE, pageWindow, toPage } from './admin/paging';

/**
 * D188: giveaways. The admin sets optional criteria over an entry period; after it ends,
 * winners are drawn at random (crypto RNG) or picked by hand from the eligible accounts.
 * A winner is told in the app (the bell) and accepts or declines there before `respondBy`.
 * Their email is read only after they accept, by an admin giving a reason (audited), so the
 * prize (an eGift card) can be sent to the address on the account.
 *
 * Always required: an ACTIVE account with the USER role (admins can't win), created before
 * the entry period ends, not already picked for this giveaway.
 */

type Tx = Prisma.TransactionClient;
const DAY_MS = 86_400_000;
const TZ = 'America/New_York';
/** Winner slots these statuses take up; the others (declined, expired…) free the slot. */
const HOLDING: GiveawayWinnerStatus[] = ['NOTIFIED', 'ACCEPTED', 'PRIZE_SENT'];
/** D210: the eligible list is paged like every admin list. */
export const POOL_PAGE_SIZE = ADMIN_PAGE_SIZE;

// ───────────────────────────── Eligibility ─────────────────────────────

export interface PoolRow {
  id: string;
  username: string;
  createdAt: Date;
  posts: number;
  postDays: number;
  comments: number;
  places: number;
  /** Days they opened the app in the entry period. */
  activeDays: number;
  /** Draw tickets: one per active day (at least 1) when the giveaway uses them, else 1. */
  tickets: number;
}

/** The eligible accounts' SQL: one row per account with its activity in the entry period. */
async function poolQuery(g: Giveaway, now: Date) {
  const s = g.startsAt;
  const e = g.endsAt;
  const decayDays = await getConfig('strikes.decayDays');
  const where: Prisma.Sql[] = [
    Prisma.sql`u.status = 'ACTIVE'`,
    Prisma.sql`u.role = 'USER'`,
    Prisma.sql`u."createdAt" < ${e}`,
    Prisma.sql`NOT EXISTS (SELECT 1 FROM "GiveawayWinner" w
                 WHERE w."userId" = u.id AND w."giveawayId" = ${g.id}::uuid)`,
  ];
  if (g.requireConfirmedEmail) where.push(Prisma.sql`u."emailVerifiedAt" IS NOT NULL`);
  if (g.joinedAfter) where.push(Prisma.sql`u."createdAt" >= ${g.joinedAfter}`);
  if (g.joinedBefore) where.push(Prisma.sql`u."createdAt" < ${g.joinedBefore}`);
  if (g.minAccountAgeDays) {
    where.push(
      Prisma.sql`u."createdAt" <= ${new Date(e.getTime() - g.minAccountAgeDays * DAY_MS)}`,
    );
  }
  if (g.requireNoStrikes) {
    where.push(Prisma.sql`NOT EXISTS (SELECT 1 FROM "ModerationAction" m
      WHERE m."targetUserId" = u.id AND m.action IN ('WARN', 'SUSPEND', 'BAN')
        AND m."voidedAt" IS NULL AND m."createdAt" > ${new Date(now.getTime() - decayDays * DAY_MS)})`);
  }
  if (g.excludePastWinners) {
    where.push(Prisma.sql`NOT EXISTS (SELECT 1 FROM "GiveawayWinner" w
      WHERE w."userId" = u.id AND w.status IN ('ACCEPTED', 'PRIZE_SENT'))`);
  }
  const having: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (g.minPosts) having.push(Prisma.sql`t.posts >= ${g.minPosts}`);
  if (g.minPostDays) having.push(Prisma.sql`t."postDays" >= ${g.minPostDays}`);
  if (g.minComments) having.push(Prisma.sql`t.comments >= ${g.minComments}`);
  if (g.minApprovedPlaces) having.push(Prisma.sql`t.places >= ${g.minApprovedPlaces}`);
  if (g.minActiveDays) having.push(Prisma.sql`t."activeDays" >= ${g.minActiveDays}`);
  // Active days are local dates; the period's last day counts up to the end time.
  const firstDay = Prisma.sql`(${s}::timestamptz AT TIME ZONE ${TZ})::date`;
  const lastDay = Prisma.sql`((${e}::timestamptz - interval '1 millisecond') AT TIME ZONE ${TZ})::date`;
  const tickets = g.ticketsPerActiveDay ? Prisma.sql`GREATEST(t."activeDays", 1)` : Prisma.sql`1`;
  // Posts: area posts and place-room posts, still visible, made in the entry period.
  return Prisma.sql`
    WITH p AS (
      SELECT "authorId" AS a, "createdAt" AS c FROM "GeneralPost"
      WHERE status = 'VISIBLE' AND "createdAt" >= ${s} AND "createdAt" < ${e}
      UNION ALL
      SELECT "authorId", "createdAt" FROM "BusinessPost"
      WHERE "authorId" IS NOT NULL AND status = 'VISIBLE' AND "createdAt" >= ${s} AND "createdAt" < ${e}
    )
    SELECT t.*, ${tickets}::int AS tickets FROM (
      SELECT u.id, u.username, u."createdAt",
        (SELECT count(*) FROM "UserActiveDay" d WHERE d."userId" = u.id
           AND d.day BETWEEN ${firstDay} AND ${lastDay})::int AS "activeDays",
        (SELECT count(*) FROM p WHERE p.a = u.id)::int AS posts,
        (SELECT count(DISTINCT (p.c AT TIME ZONE ${TZ})::date) FROM p WHERE p.a = u.id)::int AS "postDays",
        (SELECT count(*) FROM "Comment" c WHERE c."authorUserId" = u.id AND c.status = 'VISIBLE'
           AND c."createdAt" >= ${s} AND c."createdAt" < ${e})::int AS comments,
        (SELECT count(*) FROM "BusinessSubmission" b WHERE b."submitterId" = u.id
           AND b.status = 'APPROVED' AND b."createdAt" >= ${s} AND b."createdAt" < ${e})::int AS places
      FROM "User" u
      WHERE ${Prisma.join(where, ' AND ')}
    ) t
    WHERE ${Prisma.join(having, ' AND ')}`;
}

async function eligibleIds(client: Tx, g: Giveaway, now: Date, onlyUserId?: string) {
  return (await eligibleTickets(client, g, now, onlyUserId)).map((r) => r.id);
}

/** Eligible account IDs with their draw tickets. */
async function eligibleTickets(client: Tx, g: Giveaway, now: Date, onlyUserId?: string) {
  const q = await poolQuery(g, now);
  return client.$queryRaw<{ id: string; tickets: number }[]>`
    SELECT id, tickets FROM (${q}) e
    ${onlyUserId ? Prisma.sql`WHERE id = ${onlyUserId}::uuid` : Prisma.empty}
    ORDER BY id`;
}

/** The eligible accounts, a page at a time (alphabetical), with the total. */
export async function eligiblePool(g: Giveaway, page = 1, now = new Date()) {
  const q = await poolQuery(g, now);
  const [rows, counted] = await Promise.all([
    db.$queryRaw<PoolRow[]>`SELECT * FROM (${q}) e ORDER BY lower(username)
      LIMIT ${POOL_PAGE_SIZE} OFFSET ${(page - 1) * POOL_PAGE_SIZE}`,
    db.$queryRaw<{ n: number; tickets: number }[]>`
      SELECT count(*)::int AS n, coalesce(sum(tickets), 0)::int AS tickets FROM (${q}) e`,
  ]);
  return { rows, total: counted[0]?.n ?? 0, tickets: counted[0]?.tickets ?? 0 };
}

// ───────────────────────────── Admin ─────────────────────────────

export async function createGiveaway(adminId: string, input: z.infer<typeof giveawayCreateSchema>) {
  const date = (s?: string) => (s ? new Date(s) : null);
  const g = await db.giveaway.create({
    data: {
      title: input.title,
      prize: input.prize,
      notes: input.notes || null,
      startsAt: new Date(input.startsAt),
      endsAt: new Date(input.endsAt),
      pickMethod: input.pickMethod,
      winnerCount: input.winnerCount,
      respondDays: input.respondDays,
      minPosts: input.minPosts ?? null,
      minPostDays: input.minPostDays ?? null,
      minComments: input.minComments ?? null,
      minApprovedPlaces: input.minApprovedPlaces ?? null,
      requireConfirmedEmail: input.requireConfirmedEmail,
      requireNoStrikes: input.requireNoStrikes,
      joinedAfter: date(input.joinedAfter),
      joinedBefore: date(input.joinedBefore),
      minAccountAgeDays: input.minAccountAgeDays ?? null,
      minActiveDays: input.minActiveDays ?? null,
      ticketsPerActiveDay: input.ticketsPerActiveDay,
      excludePastWinners: input.excludePastWinners,
      createdById: adminId,
    },
  });
  await audit(adminId, 'GIVEAWAY_CREATE', { type: 'giveaway', id: g.id }, { title: g.title });
  return g;
}

/** Winners who didn't answer in time no longer hold a slot. */
async function expireOverdue(client: Tx, where: Prisma.GiveawayWinnerWhereInput, now: Date) {
  await client.giveawayWinner.updateMany({
    where: { ...where, status: 'NOTIFIED', respondBy: { lt: now } },
    data: { status: 'EXPIRED' },
  });
}

/** "Upcoming", "Open", "Ended", "Completed" (every prize sent) or "Cancelled". */
export function giveawayPhase(
  g: Pick<Giveaway, 'status' | 'startsAt' | 'endsAt' | 'winnerCount'>,
  prizesSent: number,
  now = new Date(),
) {
  if (g.status === 'CANCELLED') return 'Cancelled';
  if (prizesSent >= g.winnerCount) return 'Completed';
  if (now < g.startsAt) return 'Upcoming';
  if (now < g.endsAt) return 'Open';
  return 'Ended';
}

const winnerSelect = {
  id: true,
  status: true,
  pickedBy: true,
  poolSize: true,
  tickets: true,
  poolTickets: true,
  createdAt: true,
  respondBy: true,
  respondedAt: true,
  emailRevealedAt: true,
  prizeSentAt: true,
  adminNote: true,
  user: { select: { id: true, username: true, status: true } },
  pickedByUser: { select: { username: true } },
} satisfies Prisma.GiveawayWinnerSelect;

/** Giveaways, newest first, 20 a page (D210). */
export async function listGiveaways(page = 1, now = new Date()) {
  await expireOverdue(db, {}, now);
  const [rows, total] = await Promise.all([
    db.giveaway.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      ...pageWindow(page),
      include: { winners: { select: winnerSelect, orderBy: { createdAt: 'asc' } } },
    }),
    db.giveaway.count(),
  ]);
  const list = rows.map((g) => ({
    ...g,
    phase: giveawayPhase(g, g.winners.filter((w) => w.status === 'PRIZE_SENT').length, now),
  }));
  return toPage(list, total, page);
}

/** The tiles on the Giveaways page, counted in the database (not from one page). */
export async function giveawayCounts(now = new Date()) {
  const [giveaways, open, toSend, sent] = await Promise.all([
    db.giveaway.count(),
    db.giveaway.count({
      where: { status: 'ACTIVE', startsAt: { lte: now }, endsAt: { gt: now } },
    }),
    db.giveawayWinner.count({ where: { status: 'ACCEPTED' } }),
    db.giveawayWinner.count({ where: { status: 'PRIZE_SENT' } }),
  ]);
  return { giveaways, open, toSend, sent };
}

export async function getGiveaway(id: string, poolPage = 1, now = new Date()) {
  await expireOverdue(db, { giveawayId: id }, now);
  const g = await db.giveaway.findUnique({
    where: { id },
    include: {
      winners: { select: winnerSelect, orderBy: { createdAt: 'asc' } },
      createdBy: { select: { username: true } },
    },
  });
  if (!g) throw new ApiError(404, 'NOT_FOUND', 'Giveaway not found');
  const pool = await eligiblePool(g, poolPage, now);
  const holding = g.winners.filter((w) => HOLDING.includes(w.status)).length;
  return {
    giveaway: g,
    phase: giveawayPhase(g, g.winners.filter((w) => w.status === 'PRIZE_SENT').length, now),
    openSlots: Math.max(0, g.winnerCount - holding),
    pool,
  };
}

/** Locks the giveaway row so two draws (or a draw and a pick) can't fill the same slot. */
async function lockForPicking(tx: Tx, id: string, method: 'RANDOM' | 'MANUAL', now: Date) {
  await tx.$queryRaw`SELECT id FROM "Giveaway" WHERE id = ${id}::uuid FOR UPDATE`;
  const g = await tx.giveaway.findUnique({ where: { id } });
  if (!g) throw new ApiError(404, 'NOT_FOUND', 'Giveaway not found');
  if (g.status !== 'ACTIVE')
    throw new ApiError(409, 'GIVEAWAY_CANCELLED', 'This giveaway was cancelled');
  if (g.pickMethod !== method) {
    throw new ApiError(
      409,
      'WRONG_PICK_METHOD',
      method === 'RANDOM'
        ? 'This giveaway’s winners are picked by hand'
        : 'This giveaway uses a random draw',
    );
  }
  if (now < g.endsAt) {
    throw new ApiError(409, 'STILL_OPEN', 'Winners can be picked once the entry period ends');
  }
  await expireOverdue(tx, { giveawayId: id }, now);
  const holding = await tx.giveawayWinner.count({
    where: { giveawayId: id, status: { in: HOLDING } },
  });
  const open = g.winnerCount - holding;
  if (open <= 0) throw new ApiError(409, 'NO_OPEN_SLOTS', 'Every winner slot is taken');
  return { g, open };
}

async function addWinners(
  tx: Tx,
  g: Giveaway,
  picks: { id: string; tickets: number }[],
  opts: { adminId: string; poolSize: number; poolTickets: number; now: Date },
) {
  const respondBy = new Date(opts.now.getTime() + g.respondDays * DAY_MS);
  for (const { id: userId, tickets } of picks) {
    const w = await tx.giveawayWinner.create({
      data: {
        giveawayId: g.id,
        userId,
        pickedBy: g.pickMethod,
        poolSize: opts.poolSize,
        tickets: g.ticketsPerActiveDay ? tickets : null,
        poolTickets: g.ticketsPerActiveDay ? opts.poolTickets : null,
        pickedById: opts.adminId,
        respondBy,
        createdAt: opts.now,
      },
    });
    await tx.notification.create({
      data: { userId, type: 'GIVEAWAY_WIN', giveawayWinnerId: w.id, createdAt: opts.now },
    });
  }
}

/**
 * `count` distinct picks, each chosen with chance proportional to its tickets among those
 * not yet picked (a drawing where a winner's other tickets leave the drum). Crypto RNG.
 */
export function pickWeighted<T extends { tickets: number }>(rows: T[], count: number): T[] {
  const left = rows.filter((r) => r.tickets > 0);
  const out: T[] = [];
  while (out.length < count && left.length) {
    const total = left.reduce((n, r) => n + r.tickets, 0);
    let ticket = randomInt(total);
    const i = left.findIndex((r) => (ticket -= r.tickets) < 0);
    out.push(left.splice(i, 1)[0]!);
  }
  return out;
}

export async function giveawayAction(
  adminId: string,
  id: string,
  input: z.infer<typeof giveawayActionSchema>,
  now = new Date(),
) {
  switch (input.action) {
    case 'draw': {
      const picked = await db.$transaction(async (tx) => {
        const { g, open } = await lockForPicking(tx, id, 'RANDOM', now);
        const pool = await eligibleTickets(tx, g, now);
        if (!pool.length) {
          throw new ApiError(409, 'NO_ELIGIBLE', 'No eligible accounts to draw from');
        }
        const poolTickets = pool.reduce((n, r) => n + r.tickets, 0);
        const picks = pickWeighted(pool, open);
        await addWinners(tx, g, picks, { adminId, poolSize: pool.length, poolTickets, now });
        return { ids: picks.map((p) => p.id), poolSize: pool.length, poolTickets };
      });
      await audit(adminId, 'GIVEAWAY_DRAW', { type: 'giveaway', id }, picked);
      return {
        drawn: picked.ids.length,
        poolSize: picked.poolSize,
        poolTickets: picked.poolTickets,
      };
    }
    case 'pick': {
      const user = await db.user.findUnique({
        where: { usernameNormalized: normalizeUsername(input.username.replace(/^@/, '')) },
        select: { id: true },
      });
      const result = await db.$transaction(async (tx) => {
        const { g } = await lockForPicking(tx, id, 'MANUAL', now);
        const eligible = user ? await eligibleIds(tx, g, now, user.id) : [];
        // Unknown, ineligible and already picked all read the same.
        if (!user || !eligible.length) {
          throw new ApiError(409, 'NOT_ELIGIBLE', 'That account isn’t eligible for this giveaway');
        }
        const pool = await eligibleTickets(tx, g, now);
        const mine = pool.find((r) => r.id === user.id)!;
        const poolSize = pool.length;
        const poolTickets = pool.reduce((n, r) => n + r.tickets, 0);
        await addWinners(tx, g, [mine], { adminId, poolSize, poolTickets, now });
        return { userId: user.id, poolSize };
      });
      await audit(adminId, 'GIVEAWAY_PICK', { type: 'giveaway', id }, result);
      return { drawn: 1, poolSize: result.poolSize };
    }
    case 'cancel': {
      const done = await db.giveaway.updateMany({
        where: { id, status: 'ACTIVE' },
        data: { status: 'CANCELLED' },
      });
      if (!done.count)
        throw new ApiError(404, 'NOT_FOUND', 'Giveaway not found or already cancelled');
      await audit(adminId, 'GIVEAWAY_CANCEL', { type: 'giveaway', id }, { reason: input.reason });
      return null;
    }
  }
}

export async function winnerAction(
  adminId: string,
  giveawayId: string,
  winnerId: string,
  input: z.infer<typeof giveawayWinnerActionSchema>,
  now = new Date(),
) {
  await expireOverdue(db, { id: winnerId }, now);
  const w = await db.giveawayWinner.findFirst({
    where: { id: winnerId, giveawayId },
    include: { user: { select: { id: true, status: true, dekWrapped: true, emailEnc: true } } },
  });
  if (!w) throw new ApiError(404, 'NOT_FOUND', 'Winner not found');
  const target = { type: 'giveawayWinner', id: w.id };
  switch (input.action) {
    case 'revealEmail': {
      // Only once they've said yes: the rules promise the email is used for the prize only.
      if (w.status !== 'ACCEPTED' && w.status !== 'PRIZE_SENT') {
        throw new ApiError(409, 'NOT_ACCEPTED', 'The email is available once they accept');
      }
      if (w.user.status === 'DELETED' || !w.user.emailEnc) {
        throw new ApiError(409, 'NO_EMAIL', 'This account no longer has an email');
      }
      const email = decryptUserEmail(w.user);
      await db.giveawayWinner.update({ where: { id: w.id }, data: { emailRevealedAt: now } });
      await audit(adminId, 'GIVEAWAY_EMAIL_REVEAL', target, { reason: input.reason, giveawayId });
      return { email };
    }
    case 'prizeSent': {
      const done = await db.giveawayWinner.updateMany({
        where: { id: w.id, status: 'ACCEPTED' },
        data: { status: 'PRIZE_SENT', prizeSentAt: now, adminNote: input.note || w.adminNote },
      });
      if (!done.count)
        throw new ApiError(409, 'NOT_ACCEPTED', 'Only an accepted prize can be marked sent');
      await audit(adminId, 'GIVEAWAY_PRIZE_SENT', target, { giveawayId });
      return null;
    }
    case 'disqualify': {
      const done = await db.giveawayWinner.updateMany({
        where: { id: w.id, status: { in: ['NOTIFIED', 'ACCEPTED'] } },
        data: { status: 'DISQUALIFIED', adminNote: input.reason },
      });
      if (!done.count)
        throw new ApiError(409, 'CANT_DISQUALIFY', 'This winner can’t be disqualified now');
      await audit(adminId, 'GIVEAWAY_DISQUALIFY', target, { reason: input.reason, giveawayId });
      return null;
    }
  }
}

// ───────────────────────────── The winner ─────────────────────────────

/** "jordan@gmail.com" → "j•••@gmail.com". */
export function maskEmail(email: string) {
  const at = email.lastIndexOf('@');
  if (at < 1) return '•••';
  return `${email[0]}•••${email.slice(at)}`;
}

/** Your wins, newest first. Shows your own email masked, so you can check it's right. */
export async function myWins(userId: string, now = new Date()): Promise<GiveawayWinView[]> {
  await expireOverdue(db, { userId }, now);
  const [rows, me] = await Promise.all([
    db.giveawayWinner.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { giveaway: { select: { title: true, prize: true, status: true } } },
    }),
    db.user.findUnique({
      where: { id: userId },
      select: { id: true, dekWrapped: true, emailEnc: true },
    }),
  ]);
  let masked: string | null = null;
  try {
    masked = me ? maskEmail(decryptUserEmail(me)) : null;
  } catch {
    masked = null;
  }
  return rows.map((w) => ({
    id: w.id,
    title: w.giveaway.title,
    prize: w.giveaway.prize,
    // A cancelled giveaway can't be accepted any more.
    status: w.giveaway.status === 'CANCELLED' && w.status === 'NOTIFIED' ? 'EXPIRED' : w.status,
    respondBy: w.respondBy.toISOString(),
    maskedEmail: masked,
    createdAt: w.createdAt.toISOString(),
  }));
}

export async function respondToWin(
  user: { id: string; emailVerifiedAt: Date | null },
  winId: string,
  accept: boolean,
  now = new Date(),
) {
  await enforce(
    [
      {
        key: `giveaway-response:${user.id}`,
        limitKey: 'rateLimit.giveawayResponse.perMinute',
        windowSeconds: 60,
      },
    ],
    now,
  );
  await expireOverdue(db, { id: winId, userId: user.id }, now);
  const w = await db.giveawayWinner.findUnique({
    where: { id: winId },
    include: { giveaway: { select: { status: true } } },
  });
  // Someone else's win looks the same as a missing one.
  if (!w || w.userId !== user.id) throw new ApiError(404, 'NOT_FOUND', 'Not found');
  if (w.giveaway.status !== 'ACTIVE' || w.status !== 'NOTIFIED' || w.respondBy <= now) {
    throw new ApiError(409, 'NOT_OPEN', 'This prize can’t be answered any more');
  }
  if (accept && !user.emailVerifiedAt) {
    throw new ApiError(
      409,
      'EMAIL_NOT_CONFIRMED',
      'Confirm your email first, so the prize can reach you',
    );
  }
  const done = await db.giveawayWinner.updateMany({
    where: { id: w.id, status: 'NOTIFIED', respondBy: { gt: now } },
    data: { status: accept ? 'ACCEPTED' : 'DECLINED', respondedAt: now },
  });
  if (!done.count) throw new ApiError(409, 'NOT_OPEN', 'This prize can’t be answered any more');
  await db.notification.updateMany({
    where: { giveawayWinnerId: w.id, readAt: null },
    data: { readAt: now },
  });
}
