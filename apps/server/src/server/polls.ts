import { createHmac } from 'node:crypto';
import {
  POLL_MIN_GROUP,
  POLL_SCALE_MAX,
  POLL_TOPICS,
  type AdminPollRequest,
  type PollCounts,
  type PollKind,
  type PollResults,
  type PollStatus,
  type PollTopic,
  type PollView,
} from '@jax/shared';
import type { PollKind as DbPollKind, Prisma, User } from '@/generated/prisma/client';
import { getConfig } from './config';
import { createUserKey, unwrapUserKey } from './crypto/field-encryption';
import { db } from './db';
import { ApiError } from './http';
import type { GeoPoint } from './location/eligibility';

/**
 * D123 / D124: weekly polls, "count, don't record" like the area statistics (D116).
 * - While open, a vote is one PollVoter row (a code made from the account ID with the poll's
 *   own secret key, and the voter's ZIP code; no account ID, no time) plus one PollSelection
 *   row per answer picked. The voter row's key blocks a second vote; the code also lets the
 *   server show you your own answers.
 * - When the poll closes, finalizeDuePolls turns them into PollVoterTally (voters per ZIP) and
 *   PollTally (picks per answer per ZIP), deletes the per-person rows and destroys the key.
 *   After that nothing links back to anyone.
 * - Every type (Yes / No, Pick one, Pick several, Rating) is stored the same way; only the
 *   number of answers a person may pick differs. Percentages are a share of voters.
 * - Results are shown only after closing; ZIPs under POLL_MIN_GROUP voters are combined.
 */

const DAY_MS = 86_400_000;
const keyOwner = (pollId: string) => `pollkey:${pollId}`;
const toDb = (k: PollKind) => k.toUpperCase() as DbPollKind;
const fromDb = (k: DbPollKind) => k.toLowerCase() as PollKind;
const asTopic = (t: string): PollTopic => (t in POLL_TOPICS ? (t as PollTopic) : 'other');

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
 * Counts every poll that has closed and isn't counted yet, in one transaction each: voters
 * per ZIP and picks per answer per ZIP, then the per-person rows are deleted and the key
 * destroyed. Safe to run any number of times and from two places at once (row lock).
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
        INSERT INTO "PollVoterTally" ("pollId", zip, voters)
        SELECT "pollId", zip, count(*)::int FROM "PollVoter"
        WHERE "pollId" = ${id}::uuid GROUP BY "pollId", zip`;
      await tx.$executeRaw`
        INSERT INTO "PollTally" ("pollId", "choiceId", zip, count)
        SELECT s."pollId", s."choiceId", v.zip, count(*)::int
        FROM "PollSelection" s
        JOIN "PollVoter" v ON v."pollId" = s."pollId" AND v."voterCode" = s."voterCode"
        WHERE s."pollId" = ${id}::uuid GROUP BY s."pollId", s."choiceId", v.zip`;
      const voters = await tx.pollVoter.count({ where: { pollId: id } });
      await tx.pollVoter.deleteMany({ where: { pollId: id } }); // selections go with them
      await tx.pollKey.deleteMany({ where: { pollId: id } });
      await tx.poll.update({ where: { id }, data: { finalizedAt: now, voterCount: voters } });
      return 1;
    });
  }
  return counted;
}

type Choice = { id: string; value: number | null };
type Tally = { choiceId: string; zip: string; count: number };
type VoterTally = { zip: string; voters: number };

function countsFor(choices: Choice[], voters: number, rows: Tally[]): PollCounts {
  const counts = choices.map((c) => ({
    choiceId: c.id,
    count: rows.filter((r) => r.choiceId === c.id).reduce((n, r) => n + r.count, 0),
  }));
  const rated = choices.length > 0 && choices.every((c) => c.value !== null);
  const total = counts.reduce((n, c) => n + c.count, 0);
  const average =
    rated && total
      ? Math.round((counts.reduce((s, c, i) => s + c.count * choices[i]!.value!, 0) / total) * 10) /
        10
      : null;
  return { voters, counts, average };
}

/** Totals, with ZIPs under the minimum combined into "Other areas" (hidden if still small). */
export function buildResults(
  choices: Choice[],
  tallies: Tally[],
  voterTallies: VoterTally[],
): PollResults {
  const areas: PollResults['areas'] = [];
  const smallZips = new Set<string>();
  let smallVoters = 0;
  for (const v of voterTallies) {
    if (v.zip && v.voters >= POLL_MIN_GROUP) {
      areas.push({
        zip: v.zip,
        ...countsFor(
          choices,
          v.voters,
          tallies.filter((t) => t.zip === v.zip),
        ),
      });
    } else {
      smallZips.add(v.zip);
      smallVoters += v.voters;
    }
  }
  areas.sort((a, b) => b.voters - a.voters || a.zip.localeCompare(b.zip));
  const voters = voterTallies.reduce((n, v) => n + v.voters, 0);
  return {
    ...countsFor(choices, voters, tallies),
    areas,
    otherAreas:
      smallVoters >= POLL_MIN_GROUP
        ? countsFor(
            choices,
            smallVoters,
            tallies.filter((t) => smallZips.has(t.zip)),
          )
        : null,
  };
}

const pollInclude = {
  choices: {
    orderBy: { position: 'asc' },
    select: { id: true, label: true, value: true },
  },
  tallies: { select: { choiceId: true, zip: true, count: true } },
  voterTallies: { select: { zip: true, voters: true } },
} satisfies Prisma.PollInclude;

type PollRow = Prisma.PollGetPayload<{ include: typeof pollInclude }>;

function loadPolls(where: Prisma.PollWhereInput, take?: number) {
  return db.poll.findMany({ where, orderBy: { closesAt: 'desc' }, take, include: pollInclude });
}

async function myAnswers(pollId: string, userId: string): Promise<string[]> {
  const key = await pollKey(pollId, false);
  if (!key) return [];
  const rows = await db.pollSelection.findMany({
    where: { pollId, voterCode: voterCode(key, userId) },
    select: { choiceId: true },
  });
  return rows.map((r) => r.choiceId);
}

const scaleOf = (p: { scaleLowLabel: string | null; scaleHighLabel: string | null }) =>
  p.scaleLowLabel && p.scaleHighLabel ? { low: p.scaleLowLabel, high: p.scaleHighLabel } : null;

/**
 * Whether this person could vote at all right now: a confirmed, active account old enough
 * (guests never). The vote route checks the same things, plus location.
 */
async function voterReady(userId: string | null, now: Date): Promise<boolean> {
  if (!userId) return false;
  const [u, days] = await Promise.all([
    db.user.findUnique({
      where: { id: userId },
      select: { status: true, emailVerifiedAt: true, createdAt: true },
    }),
    getConfig('polls.voterMinAccountDays'),
  ]);
  return (
    !!u &&
    u.status === 'ACTIVE' &&
    !!u.emailVerifiedAt &&
    now.getTime() - u.createdAt.getTime() >= days * DAY_MS
  );
}

async function view(
  p: PollRow,
  userId: string | null,
  now: Date,
  ready: boolean,
): Promise<PollView> {
  const status = pollStatus(p, now);
  const myChoiceIds = status === 'open' && userId ? await myAnswers(p.id, userId) : [];
  return {
    id: p.id,
    kind: fromDb(p.kind),
    topic: asTopic(p.topic),
    question: p.question,
    details: p.details,
    maxPicks: p.maxPicks,
    scale: scaleOf(p),
    opensAt: p.opensAt.toISOString(),
    closesAt: p.closesAt.toISOString(),
    status,
    choices: p.choices,
    myChoiceIds,
    canVote: status === 'open' && ready && myChoiceIds.length === 0,
    results:
      status === 'closed' && p.finalizedAt
        ? buildResults(p.choices, p.tallies, p.voterTallies)
        : null,
  };
}

/**
 * The open polls, then the most recent closed ones (the archive), optionally one topic.
 * Guests pass null.
 */
export async function listPolls(
  userId: string | null,
  opts: { now?: Date; archive?: number; topic?: PollTopic } = {},
) {
  const now = opts.now ?? new Date();
  await finalizeDuePolls(now);
  const topic = opts.topic ? { topic: opts.topic } : {};
  const [open, closed] = await Promise.all([
    loadPolls({ opensAt: { lte: now }, closesAt: { gt: now }, ...topic }),
    loadPolls({ closesAt: { lte: now }, ...topic }, opts.archive ?? 20),
  ]);
  const ready = await voterReady(userId, now);
  return {
    open: await Promise.all(open.map((p) => view(p, userId, now, ready))),
    closed: await Promise.all(closed.map((p) => view(p, userId, now, ready))),
  };
}

/** One poll (not one that hasn't opened yet: those stay private to the admin). */
export async function getPoll(id: string, userId: string | null, now = new Date()) {
  await finalizeDuePolls(now);
  const [p] = await loadPolls({ id, opensAt: { lte: now } });
  if (!p) throw new ApiError(404, 'NOT_FOUND', 'Poll not found');
  return view(p, userId, now, await voterReady(userId, now));
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

/**
 * The poll is open and the answers fit its type: one answer, or for Pick several between
 * one and `maxPicks`, all from this poll. Checked before the location check.
 */
export async function assertPollOpen(pollId: string, choiceIds: string[], now = new Date()) {
  const p = await db.poll.findUnique({
    where: { id: pollId },
    select: {
      kind: true,
      maxPicks: true,
      opensAt: true,
      closesAt: true,
      choices: { select: { id: true } },
    },
  });
  if (!p || now < p.opensAt) throw new ApiError(404, 'NOT_FOUND', 'Poll not found');
  if (now >= p.closesAt) throw new ApiError(409, 'POLL_CLOSED', 'This poll has closed.');
  const ids = new Set(p.choices.map((c) => c.id));
  if (!choiceIds.every((id) => ids.has(id))) {
    throw new ApiError(400, 'INVALID_CHOICE', 'That answer isn’t part of this poll.');
  }
  const most = p.kind === 'MULTI' ? (p.maxPicks ?? p.choices.length) : 1;
  if (choiceIds.length > most) {
    throw new ApiError(
      400,
      'TOO_MANY_CHOICES',
      most === 1 ? 'Pick one answer.' : `Pick up to ${most} answers.`,
    );
  }
}

/** One final vote. The ZIP comes from the checked reading; the reading itself isn't stored. */
export async function castPollVote(
  userId: string,
  pollId: string,
  choiceIds: string[],
  here: GeoPoint,
  now = new Date(),
) {
  await assertPollOpen(pollId, choiceIds, now);
  const key = (await pollKey(pollId, true))!;
  const code = voterCode(key, userId);
  await db.$transaction(async (tx) => {
    const inserted = await tx.$executeRaw`
      INSERT INTO "PollVoter" ("pollId", "voterCode", zip)
      VALUES (${pollId}::uuid, ${code},
        COALESCE((SELECT z.zip FROM "ZipArea" z
                  WHERE ST_Covers(z.geom, ST_SetSRID(ST_MakePoint(${here.longitude}, ${here.latitude}), 4326)::geography)
                  ORDER BY z.zip LIMIT 1), ''))
      ON CONFLICT ("pollId", "voterCode") DO NOTHING`;
    if (inserted === 0) {
      throw new ApiError(409, 'ALREADY_VOTED', 'You already voted in this poll.');
    }
    await tx.pollSelection.createMany({
      data: choiceIds.map((choiceId) => ({ pollId, voterCode: code, choiceId })),
    });
  });
  return getPoll(pollId, userId, now);
}

// ─────────────────────────────── Admin ───────────────────────────────

/** The poll's columns and answers for its type (Yes / No and Rating answers are fixed). */
function pollData(input: AdminPollRequest) {
  const labels =
    input.kind === 'yes_no'
      ? ['Yes', 'No', ...(input.includeUnsure ? ['Not sure'] : [])]
      : input.kind === 'scale'
        ? Array.from({ length: POLL_SCALE_MAX }, (_, i) => String(i + 1))
        : input.choices;
  return {
    kind: toDb(input.kind),
    topic: input.topic,
    question: input.question,
    details: input.details ?? null,
    maxPicks: input.kind === 'multi' ? (input.maxPicks ?? null) : null,
    scaleLowLabel: input.kind === 'scale' ? input.lowLabel : null,
    scaleHighLabel: input.kind === 'scale' ? input.highLabel : null,
    opensAt: new Date(input.opensAt),
    closesAt: new Date(input.closesAt),
    choices: {
      create: labels.map((label, position) => ({
        label,
        position,
        value: input.kind === 'scale' ? position + 1 : null,
      })),
    },
  };
}

/** Admin list: every poll with its status and, while open, only how many have voted. */
export async function adminListPolls(now = new Date()) {
  await finalizeDuePolls(now);
  const polls = await db.poll.findMany({
    orderBy: { opensAt: 'desc' },
    take: 100,
    include: {
      ...pollInclude,
      createdBy: { select: { username: true } },
      _count: { select: { voters: true } },
    },
  });
  return polls.map((p) => ({
    id: p.id,
    kind: fromDb(p.kind),
    topic: asTopic(p.topic),
    question: p.question,
    details: p.details,
    maxPicks: p.maxPicks,
    scale: scaleOf(p),
    opensAt: p.opensAt.toISOString(),
    closesAt: p.closesAt.toISOString(),
    status: pollStatus(p, now),
    choices: p.choices,
    createdBy: p.createdBy?.username ?? null,
    votesSoFar: p.finalizedAt ? p.voterCount : p._count.voters,
    results: p.finalizedAt ? buildResults(p.choices, p.tallies, p.voterTallies) : null,
  }));
}

export async function createPoll(adminId: string, input: AdminPollRequest) {
  const p = await db.poll.create({ data: { ...pollData(input), createdById: adminId } });
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
    db.poll.update({ where: { id }, data: pollData(input) }),
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
  if (pollStatus(p, now) !== 'open') {
    throw new ApiError(409, 'POLL_NOT_OPEN', 'This poll isn’t open.');
  }
  // Never before it opened (the table requires closesAt > opensAt).
  const closesAt = new Date(Math.max(now.getTime(), p.opensAt.getTime() + 1));
  await db.poll.update({ where: { id }, data: { closesAt } });
  await finalizeDuePolls(now);
}
