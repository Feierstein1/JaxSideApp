import { createHmac } from 'node:crypto';
import {
  POLL_MIN_GROUP,
  type AdminPollRequest,
  type PollCounts,
  type PollResults,
  type PollStatus,
  type PollView,
} from '@jax/shared';
import type { Prisma, User } from '@/generated/prisma/client';
import { getConfig } from './config';
import { createUserKey, unwrapUserKey } from './crypto/field-encryption';
import { db } from './db';
import { ApiError } from './http';
import type { GeoPoint } from './location/eligibility';

/**
 * D123: weekly polls, "count, don't record" like the area statistics (D116).
 * - A vote is stored as a code made from the account ID with the poll's own secret key, the
 *   choice and the voter's ZIP code. No account ID, no time.
 * - While the poll is open, the code lets the server show you your own choice and refuse a
 *   second vote.
 * - When it closes, the votes become totals per choice and ZIP, the coded votes are deleted
 *   and the key is destroyed (finalizePoll). After that nothing links back to anyone.
 * - Results are shown only after closing; ZIPs under POLL_MIN_GROUP voters are combined.
 */

const DAY_MS = 86_400_000;
const keyOwner = (pollId: string) => `pollkey:${pollId}`;

export function pollStatus(p: { opensAt: Date; closesAt: Date }, now = new Date()): PollStatus {
  if (now < p.opensAt) return 'upcoming';
  return now < p.closesAt ? 'open' : 'closed';
}

/** The poll's key, created with the first vote. Null once destroyed (counted). */
async function pollKey(pollId: string, create: boolean): Promise<Buffer | null> {
  if (create) {
    // Two votes may race to create it: the first insert wins and both read that one.
    await db.pollKey.createMany({
      data: [{ pollId, keyWrapped: Buffer.from(createUserKey(keyOwner(pollId)).wrapped) }],
      skipDuplicates: true,
    });
  }
  const row = await db.pollKey.findUnique({ where: { pollId } });
  return row ? unwrapUserKey(keyOwner(pollId), row.keyWrapped) : null;
}

const voterCode = (key: Buffer, userId: string) =>
  createHmac('sha256', key).update(userId).digest().subarray(0, 16);

/**
 * Counts every poll that has closed and isn't counted yet: totals per choice and ZIP, then
 * the coded votes are deleted and the key destroyed, in one transaction. Safe to run any
 * number of times and from two places at once (the row lock decides who counts).
 */
export async function finalizeDuePolls(now = new Date()): Promise<number> {
  const due = await db.poll.findMany({
    where: { finalizedAt: null, closesAt: { lte: now } },
    select: { id: true },
  });
  let counted = 0;
  for (const { id } of due) {
    counted += await db.$transaction(async (tx) => {
      const [locked] = await tx.$queryRaw<{ id: string }[]>`
        SELECT id FROM "Poll" WHERE id = ${id}::uuid AND "finalizedAt" IS NULL FOR UPDATE`;
      if (!locked) return 0;
      await tx.$executeRaw`
        INSERT INTO "PollTally" ("pollId", "choiceId", zip, count)
        SELECT "pollId", "choiceId", zip, count(*)::int FROM "PollBallot"
        WHERE "pollId" = ${id}::uuid GROUP BY "pollId", "choiceId", zip`;
      const voters = await tx.pollBallot.count({ where: { pollId: id } });
      await tx.pollBallot.deleteMany({ where: { pollId: id } });
      await tx.pollKey.deleteMany({ where: { pollId: id } });
      await tx.poll.update({ where: { id }, data: { finalizedAt: now, voterCount: voters } });
      return 1;
    });
  }
  return counted;
}

type Tally = { choiceId: string; zip: string; count: number };

function countsFor(choices: { id: string }[], rows: Tally[]): PollCounts {
  const counts = choices.map((c) => ({
    choiceId: c.id,
    count: rows.filter((r) => r.choiceId === c.id).reduce((n, r) => n + r.count, 0),
  }));
  return { voters: counts.reduce((n, c) => n + c.count, 0), counts };
}

/** Totals, with ZIPs under the minimum combined into "Other areas" (hidden if still small). */
export function buildResults(choices: { id: string }[], tallies: Tally[]): PollResults {
  const byZip = new Map<string, Tally[]>();
  for (const t of tallies) byZip.set(t.zip, [...(byZip.get(t.zip) ?? []), t]);
  const areas: PollResults['areas'] = [];
  const small: Tally[] = [];
  for (const [zip, rows] of byZip) {
    const c = countsFor(choices, rows);
    if (zip && c.voters >= POLL_MIN_GROUP) areas.push({ zip, ...c });
    else small.push(...rows);
  }
  areas.sort((a, b) => b.voters - a.voters || a.zip.localeCompare(b.zip));
  const other = countsFor(choices, small);
  return {
    ...countsFor(choices, tallies),
    areas,
    otherAreas: other.voters >= POLL_MIN_GROUP ? other : null,
  };
}

type PollRow = Awaited<ReturnType<typeof loadPolls>>[number];

function loadPolls(where: Prisma.PollWhereInput, take?: number) {
  return db.poll.findMany({
    where,
    orderBy: { closesAt: 'desc' },
    take,
    include: {
      choices: { orderBy: { position: 'asc' }, select: { id: true, label: true } },
      tallies: { select: { choiceId: true, zip: true, count: true } },
    },
  });
}

async function view(p: PollRow, userId: string | null, now: Date): Promise<PollView> {
  const status = pollStatus(p, now);
  let myChoiceId: string | null = null;
  if (status === 'open' && userId) {
    const key = await pollKey(p.id, false);
    if (key) {
      const b = await db.pollBallot.findUnique({
        where: { pollId_voterCode: { pollId: p.id, voterCode: voterCode(key, userId) } },
        select: { choiceId: true },
      });
      myChoiceId = b?.choiceId ?? null;
    }
  }
  return {
    id: p.id,
    question: p.question,
    details: p.details,
    opensAt: p.opensAt.toISOString(),
    closesAt: p.closesAt.toISOString(),
    status,
    choices: p.choices,
    myChoiceId,
    results: status === 'closed' && p.finalizedAt ? buildResults(p.choices, p.tallies) : null,
  };
}

/** The open polls, then the most recent closed ones (the archive). Guests pass null. */
export async function listPolls(userId: string | null, now = new Date(), archive = 10) {
  await finalizeDuePolls(now);
  const [open, closed] = await Promise.all([
    loadPolls({ opensAt: { lte: now }, closesAt: { gt: now } }),
    loadPolls({ closesAt: { lte: now } }, archive),
  ]);
  return {
    open: await Promise.all(open.map((p) => view(p, userId, now))),
    closed: await Promise.all(closed.map((p) => view(p, userId, now))),
  };
}

/** One poll (not one that hasn't opened yet: those stay private to the admin). */
export async function getPoll(id: string, userId: string | null, now = new Date()) {
  await finalizeDuePolls(now);
  const [p] = await loadPolls({ id, opensAt: { lte: now } });
  if (!p) throw new ApiError(404, 'NOT_FOUND', 'Poll not found');
  return view(p, userId, now);
}

/** Confirmed accounts a few days old (the route already checked the email). */
export async function pollVoterAllowed(user: Pick<User, 'createdAt'>, now = new Date()) {
  const days = await getConfig('polls.voterMinAccountDays');
  if (now.getTime() - user.createdAt.getTime() < days * DAY_MS) {
    throw new ApiError(
      403,
      'ACCOUNT_TOO_NEW',
      `New accounts can vote in polls after ${days} days. Thanks for your patience.`,
    );
  }
}

/** The open poll and the choice, before the location check (404 / 409 first). */
export async function assertPollOpen(pollId: string, choiceId: string, now = new Date()) {
  const p = await db.poll.findUnique({
    where: { id: pollId },
    select: { opensAt: true, closesAt: true, choices: { select: { id: true } } },
  });
  if (!p || now < p.opensAt) throw new ApiError(404, 'NOT_FOUND', 'Poll not found');
  if (now >= p.closesAt) throw new ApiError(409, 'POLL_CLOSED', 'This poll has closed.');
  if (!p.choices.some((c) => c.id === choiceId)) {
    throw new ApiError(400, 'INVALID_CHOICE', 'That choice isn’t part of this poll.');
  }
}

/** One final vote. The ZIP comes from the checked reading; the reading itself isn't stored. */
export async function castPollVote(
  userId: string,
  pollId: string,
  choiceId: string,
  here: GeoPoint,
  now = new Date(),
) {
  await assertPollOpen(pollId, choiceId, now);
  const key = (await pollKey(pollId, true))!;
  const code = voterCode(key, userId);
  const inserted = await db.$executeRaw`
    INSERT INTO "PollBallot" ("pollId", "voterCode", "choiceId", zip)
    VALUES (${pollId}::uuid, ${code}, ${choiceId}::uuid,
      COALESCE((SELECT z.zip FROM "ZipArea" z
                WHERE ST_Covers(z.geom, ST_SetSRID(ST_MakePoint(${here.longitude}, ${here.latitude}), 4326)::geography)
                ORDER BY z.zip LIMIT 1), ''))
    ON CONFLICT ("pollId", "voterCode") DO NOTHING`;
  if (inserted === 0) throw new ApiError(409, 'ALREADY_VOTED', 'You already voted in this poll.');
  return getPoll(pollId, userId, now);
}

// ─────────────────────────────── Admin ───────────────────────────────

/** Admin list: every poll with its status and, while open, only how many have voted. */
export async function adminListPolls(now = new Date()) {
  await finalizeDuePolls(now);
  const polls = await db.poll.findMany({
    orderBy: { opensAt: 'desc' },
    take: 100,
    include: {
      choices: { orderBy: { position: 'asc' }, select: { id: true, label: true } },
      tallies: { select: { choiceId: true, zip: true, count: true } },
      createdBy: { select: { username: true } },
      _count: { select: { ballots: true } },
    },
  });
  return polls.map((p) => ({
    id: p.id,
    question: p.question,
    details: p.details,
    opensAt: p.opensAt.toISOString(),
    closesAt: p.closesAt.toISOString(),
    status: pollStatus(p, now),
    choices: p.choices,
    createdBy: p.createdBy?.username ?? null,
    votesSoFar: p.finalizedAt ? p.voterCount : p._count.ballots,
    results: p.finalizedAt ? buildResults(p.choices, p.tallies) : null,
  }));
}

export async function createPoll(adminId: string, input: AdminPollRequest) {
  const p = await db.poll.create({
    data: {
      question: input.question,
      details: input.details ?? null,
      opensAt: new Date(input.opensAt),
      closesAt: new Date(input.closesAt),
      createdById: adminId,
      choices: { create: input.choices.map((label, position) => ({ label, position })) },
    },
  });
  return p.id;
}

/** Edits are allowed only before the poll opens (afterwards the wording is fixed). */
async function upcoming(id: string, now: Date) {
  const p = await db.poll.findUnique({ where: { id }, select: { opensAt: true } });
  if (!p) throw new ApiError(404, 'NOT_FOUND', 'Poll not found');
  if (now >= p.opensAt) {
    throw new ApiError(409, 'POLL_STARTED', 'This poll has opened; it can only be ended early.');
  }
}

export async function updatePoll(id: string, input: AdminPollRequest, now = new Date()) {
  await upcoming(id, now);
  await db.$transaction([
    db.pollChoice.deleteMany({ where: { pollId: id } }),
    db.poll.update({
      where: { id },
      data: {
        question: input.question,
        details: input.details ?? null,
        opensAt: new Date(input.opensAt),
        closesAt: new Date(input.closesAt),
        choices: { create: input.choices.map((label, position) => ({ label, position })) },
      },
    }),
  ]);
}

export async function deletePoll(id: string, now = new Date()) {
  await upcoming(id, now);
  await db.poll.delete({ where: { id } });
}

/** Ends an open poll now; it's counted right away. */
export async function endPollNow(id: string, now = new Date()) {
  const p = await db.poll.findUnique({ where: { id }, select: { opensAt: true, closesAt: true } });
  if (!p) throw new ApiError(404, 'NOT_FOUND', 'Poll not found');
  if (pollStatus(p, now) !== 'open')
    throw new ApiError(409, 'POLL_NOT_OPEN', 'This poll isn’t open.');
  // Never before it opened (the table requires closesAt > opensAt).
  const closesAt = new Date(Math.max(now.getTime(), p.opensAt.getTime() + 1));
  await db.poll.update({ where: { id }, data: { closesAt } });
  await finalizeDuePolls(now);
}
