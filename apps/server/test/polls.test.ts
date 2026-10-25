import { beforeEach, describe, expect, it } from 'vitest';
import { POST as adminCreatePOST } from '@/app/api/v1/admin/polls/route';
import { POST as adminEndPOST } from '@/app/api/v1/admin/polls/[id]/end/route';
import { DELETE as adminDELETE, PATCH as adminPATCH } from '@/app/api/v1/admin/polls/[id]/route';
import { POST as guestsPOST } from '@/app/api/v1/guests/route';
import { POST as installPOST } from '@/app/api/v1/installations/route';
import { GET as pollGET } from '@/app/api/v1/polls/[id]/route';
import { GET as pollsGET } from '@/app/api/v1/polls/route';
import { POST as votePOST } from '@/app/api/v1/polls/[id]/vote/route';
import type { PollKind as DbPollKind } from '@/generated/prisma/client';
import { createSession } from '@/server/auth/sessions';
import { db } from '@/server/db';
import { INSTALLATION_HEADER } from '@/server/installations';
import { runMaintenance } from '@/server/jobs/maintenance';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { buildResults, castPollVote, finalizeDuePolls } from '@/server/polls';
import { findForbiddenKeys } from '@/server/serializers';
import { importZipAreas } from '@/server/stats/zip-areas';
import { adminHeaders } from './admin-helpers';
import { resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D123 / D124: weekly polls, their types and topics.
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const IN = { latitude: 30.3274, longitude: -81.6588 }; // downtown
const OUT = { latitude: 30.4, longitude: -81.2 }; // in the ocean, outside Duval
const reading = (at = IN) => ({ ...at, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

let pollId: string;
let choices: string[];

async function voter(name: string, opts: { days?: number; verified?: boolean } = {}) {
  const u = await createTestUser(name, {
    createdAt: new Date(Date.now() - (opts.days ?? 10) * DAY),
    emailVerifiedAt: opts.verified === false ? null : new Date(),
  });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
}

async function newPoll(
  opts: {
    opensIn?: number;
    closesIn?: number;
    kind?: DbPollKind;
    topic?: string;
    labels?: string[];
    maxPicks?: number;
    values?: boolean;
  } = {},
) {
  const labels = opts.labels ?? ['Main Street', 'Acosta', 'Fuller Warren'];
  const p = await db.poll.create({
    data: {
      kind: opts.kind ?? 'SINGLE',
      topic: opts.topic ?? 'transport',
      question: 'Which bridge do you cross most?',
      maxPicks: opts.maxPicks ?? null,
      opensAt: new Date(Date.now() + (opts.opensIn ?? -HOUR)),
      closesAt: new Date(Date.now() + (opts.closesIn ?? DAY)),
      choices: {
        create: labels.map((label, position) => ({
          label,
          position,
          value: opts.values ? position + 1 : null,
        })),
      },
    },
    include: { choices: { orderBy: { position: 'asc' } } },
  });
  return { id: p.id, choices: p.choices.map((c) => c.id) };
}

const vote = (token: string, id: string, choiceIds: string[], at = IN) =>
  call(votePOST as H, 'POST', { token, id, body: { reading: reading(at), choiceIds } });

const close = (id: string) =>
  db.poll.update({ where: { id }, data: { closesAt: new Date(Date.now() - 1) } });

async function resultsOf(id: string) {
  await finalizeDuePolls();
  const p = await db.poll.findUniqueOrThrow({
    where: { id },
    include: { choices: { orderBy: { position: 'asc' } }, tallies: true, voterTallies: true },
  });
  return buildResults(p.choices, p.tallies, p.voterTallies);
}

beforeEach(async () => {
  await resetDb();
  await importServiceArea(db, readBoundaryFile());
  await importZipAreas(db);
  ({ id: pollId, choices } = await newPoll());
}, 60_000); // the county and ZIP outlines take a while to load

describe('voting', () => {
  it('one final vote; you see your own answer while open, but no totals', async () => {
    const me = await voter('poll_me');
    const r = await vote(me.token, pollId, [choices[1]!]);
    expect(r.status).toBe(200);
    expect(r.body.poll).toMatchObject({
      status: 'open',
      kind: 'single',
      topic: 'transport',
      myChoiceIds: [choices[1]],
      results: null,
    });
    const again = await vote(me.token, pollId, [choices[0]!]);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_VOTED');
    const list = await call(pollsGET as H, 'GET', { token: me.token });
    expect(list.body.open[0]).toMatchObject({
      id: pollId,
      myChoiceIds: [choices[1]],
      results: null,
    });
  });

  it('canVote: true until you vote; false for new, unconfirmed and guest accounts', async () => {
    const me = await voter('poll_me');
    const fresh = await voter('poll_fresh', { days: 1 });
    const unconfirmed = await voter('poll_unconf', { verified: false });
    const canVote = async (token: string) =>
      (await call(pollsGET as H, 'GET', { token })).body.open[0].canVote;
    expect(await canVote(me.token)).toBe(true);
    expect(await canVote(fresh.token)).toBe(false);
    expect(await canVote(unconfirmed.token)).toBe(false);
    await vote(me.token, pollId, [choices[0]!]);
    expect(await canVote(me.token)).toBe(false);
    const inst = (await call(installPOST as H, 'POST', { body: {} })).body.installationToken;
    const guest = await call(guestsPOST as H, 'POST', {
      body: {},
      headers: { [INSTALLATION_HEADER]: inst },
    });
    expect(await canVote(guest.body.token)).toBe(false);
  });

  it('a vote stores a code and a ZIP, never the account ID or the time', async () => {
    const me = await voter('poll_me');
    await vote(me.token, pollId, [choices[0]!]);
    const [v] = await db.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "PollVoter"`;
    expect(Object.keys(v!).sort()).toEqual(['pollId', 'voterCode', 'zip']);
    expect(v!.zip).toMatch(/^\d{5}$/);
    const [s] = await db.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "PollSelection"`;
    expect(Object.keys(s!).sort()).toEqual(['choiceId', 'pollId', 'voterCode']);
    expect(JSON.stringify([v, s])).not.toContain(me.id);
  });

  // 🔒 Who may vote.
  it('refuses guests, unconfirmed and brand-new accounts, and readings outside Duval', async () => {
    const inst = (await call(installPOST as H, 'POST', { body: {} })).body.installationToken;
    const guest = await call(guestsPOST as H, 'POST', {
      body: {},
      headers: { [INSTALLATION_HEADER]: inst },
    });
    expect((await vote(guest.body.token, pollId, [choices[0]!])).status).toBe(403); // accounts only

    const unconfirmed = await voter('poll_unconf', { verified: false });
    expect((await vote(unconfirmed.token, pollId, [choices[0]!])).status).toBe(403);

    const fresh = await voter('poll_fresh', { days: 1 });
    const r1 = await vote(fresh.token, pollId, [choices[0]!]);
    expect(r1.body.error.code).toBe('ACCOUNT_TOO_NEW');

    const away = await voter('poll_away');
    const r2 = await vote(away.token, pollId, [choices[0]!], OUT);
    expect(r2.status).toBe(403);
    expect(r2.body.error.code).toBe('LOCATION_OUTSIDE_AREA');
    expect(await db.pollVoter.count()).toBe(0);
  });

  it('refuses an answer from another poll, a poll that hasn’t opened, and a closed poll', async () => {
    const me = await voter('poll_me');
    const other = await newPoll();
    expect((await vote(me.token, pollId, [other.choices[0]!])).body.error.code).toBe(
      'INVALID_CHOICE',
    );
    const later = await newPoll({ opensIn: HOUR, closesIn: DAY });
    expect((await vote(me.token, later.id, [later.choices[0]!])).status).toBe(404);
    const done = await newPoll({ opensIn: -2 * DAY, closesIn: -HOUR });
    expect((await vote(me.token, done.id, [done.choices[0]!])).body.error.code).toBe('POLL_CLOSED');
  });

  it('guests can read polls; signed-out requests are refused', async () => {
    const inst = (await call(installPOST as H, 'POST', { body: {} })).body.installationToken;
    const guest = await call(guestsPOST as H, 'POST', {
      body: {},
      headers: { [INSTALLATION_HEADER]: inst },
    });
    const list = await call(pollsGET as H, 'GET', { token: guest.body.token });
    expect(list.status).toBe(200);
    expect(list.body.open[0]).toMatchObject({ id: pollId, myChoiceIds: [] });
    expect((await call(pollsGET as H, 'GET', {})).status).toBe(401);
  });

  it('a poll that hasn’t opened is invisible to the app', async () => {
    const me = await voter('poll_me');
    const later = await newPoll({ opensIn: HOUR });
    const list = await call(pollsGET as H, 'GET', { token: me.token });
    expect(list.body.open.map((p: { id: string }) => p.id)).toEqual([pollId]);
    expect((await call(pollGET as H, 'GET', { token: me.token, id: later.id })).status).toBe(404);
  });

  it('filters by topic', async () => {
    const me = await voter('poll_me');
    const prices = await newPoll({ topic: 'prices' });
    const r = await call(pollsGET as H, 'GET', { token: me.token, query: { topic: 'prices' } });
    expect(r.body.open.map((p: { id: string }) => p.id)).toEqual([prices.id]);
    const all = await call(pollsGET as H, 'GET', { token: me.token, query: { topic: 'nope' } });
    expect(all.body.open).toHaveLength(2); // unknown topic: ignored
  });
});

describe('types (D124)', () => {
  it('Pick one, Yes / No and Rating take exactly one answer', async () => {
    const me = await voter('poll_me');
    const r = await vote(me.token, pollId, [choices[0]!, choices[1]!]);
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('TOO_MANY_CHOICES');
    expect((await vote(me.token, pollId, [])).status).toBe(400); // schema: at least one
  });

  it('Pick several: up to the limit; shares are of voters, so they can pass 100%', async () => {
    const multi = await newPoll({
      kind: 'MULTI',
      labels: ['Parks', 'Beaches', 'Restaurants', 'Museums'],
      maxPicks: 2,
    });
    const a = await voter('poll_a');
    expect((await vote(a.token, multi.id, multi.choices.slice(0, 3))).body.error.code).toBe(
      'TOO_MANY_CHOICES',
    );
    const r = await vote(a.token, multi.id, [multi.choices[0]!, multi.choices[1]!]);
    expect(r.body.poll.myChoiceIds.sort()).toEqual([multi.choices[0], multi.choices[1]].sort());
    const b = await voter('poll_b');
    await vote(b.token, multi.id, [multi.choices[0]!]);
    await close(multi.id);
    const res = await resultsOf(multi.id);
    expect(res.voters).toBe(2);
    expect(res.counts.map((c) => c.count)).toEqual([2, 1, 0, 0]); // Parks: 2 of 2 voters = 100%
    expect(res.average).toBeNull();
  });

  it('Rating: results include the average', async () => {
    const scale = await newPoll({ kind: 'SCALE', labels: ['1', '2', '3', '4', '5'], values: true });
    for (const [i, pick] of [4, 4, 1].entries()) {
      const u = await voter(`poll_r${i}`);
      await vote(u.token, scale.id, [scale.choices[pick]!]); // 5, 5, 2
    }
    await close(scale.id);
    const res = await resultsOf(scale.id);
    expect(res.average).toBe(4);
    expect(res.counts.map((c) => c.count)).toEqual([0, 1, 0, 0, 2]);
  });
});

describe('closing and counting', () => {
  it('turns votes into totals, deletes them and destroys the key', async () => {
    const people = await Promise.all([1, 2, 3].map((i) => voter(`poll_v${i}`)));
    await vote(people[0]!.token, pollId, [choices[0]!]);
    await vote(people[1]!.token, pollId, [choices[0]!]);
    await vote(people[2]!.token, pollId, [choices[2]!]);
    expect(await db.pollKey.count()).toBe(1);
    await close(pollId);
    expect((await runMaintenance())?.pollsCounted).toBe(1);
    expect(await db.pollVoter.count()).toBe(0);
    expect(await db.pollSelection.count()).toBe(0);
    expect(await db.pollKey.count()).toBe(0);
    expect((await db.poll.findUniqueOrThrow({ where: { id: pollId } })).voterCount).toBe(3);
    const r = await call(pollGET as H, 'GET', { token: people[0]!.token, id: pollId });
    expect(r.body.poll).toMatchObject({ status: 'closed', myChoiceIds: [] });
    expect(r.body.poll.results).toMatchObject({
      voters: 3,
      counts: [
        { choiceId: choices[0], count: 2 },
        { choiceId: choices[1], count: 0 },
        { choiceId: choices[2], count: 1 },
      ],
      areas: [], // one ZIP with 3 voters: under the minimum
      otherAreas: null,
    });
    expect(findForbiddenKeys(r.body)).toEqual([]);
    expect(await finalizeDuePolls()).toBe(0); // counted once
  });

  it('shows ZIPs with at least 10 voters; smaller ones are combined, or hidden under 10', async () => {
    const spots = await db.$queryRaw<{ zip: string; lat: number; lon: number }[]>`
      SELECT zip, ST_Y(ST_PointOnSurface(geom::geometry)) AS lat,
             ST_X(ST_PointOnSurface(geom::geometry)) AS lon
      FROM "ZipArea" ORDER BY zip LIMIT 3`;
    const at = (i: number) => ({ latitude: spots[i]!.lat, longitude: spots[i]!.lon });
    let n = 0;
    const many = async (count: number, spot: number, choice: number) => {
      for (let i = 0; i < count; i++) {
        const u = await createTestUser(`pz_${n++}`);
        await castPollVote(u.id, pollId, [choices[choice]!], at(spot));
      }
    };
    await many(8, 0, 0);
    await many(4, 0, 1); // ZIP A: 12 voters
    await many(6, 1, 2); // ZIP B: 6
    await many(5, 2, 1); // ZIP C: 5 (B + C = 11 "other areas")
    await close(pollId);
    const res = await resultsOf(pollId);
    expect(res.voters).toBe(23);
    expect(res.areas).toEqual([
      {
        zip: spots[0]!.zip,
        voters: 12,
        counts: [
          { choiceId: choices[0], count: 8 },
          { choiceId: choices[1], count: 4 },
          { choiceId: choices[2], count: 0 },
        ],
        average: null,
      },
    ]);
    expect(res.otherAreas).toMatchObject({ voters: 11 });
    // Without ZIP C, "other areas" would be 6 people: hidden.
    const p = await db.poll.findUniqueOrThrow({
      where: { id: pollId },
      include: { choices: { orderBy: { position: 'asc' } }, tallies: true, voterTallies: true },
    });
    const fewer = buildResults(
      p.choices,
      p.tallies.filter((t) => t.zip !== spots[2]!.zip),
      p.voterTallies.filter((t) => t.zip !== spots[2]!.zip),
    );
    expect(fewer.otherAreas).toBeNull();
  });
});

describe('admin', () => {
  let admin: Record<string, string>;
  const dates = (opensIn: number) => ({
    opensAt: new Date(Date.now() + opensIn).toISOString(),
    closesAt: new Date(Date.now() + opensIn + 7 * DAY).toISOString(),
  });
  const body = (opensIn: number) => ({
    kind: 'single',
    topic: 'transport',
    question: 'How do you get downtown?',
    choices: ['Car', 'Bus', 'Bike', 'Walk'],
    ...dates(opensIn),
  });
  const create = (b: Record<string, unknown>) =>
    call(adminCreatePOST as H, 'POST', { headers: admin, body: b });

  beforeEach(async () => {
    admin = await adminHeaders((await createTestUser('poll_admin', { role: 'ADMIN' })).id);
  });

  it('creates a poll; edits and deletes only before it opens; ends one early', async () => {
    const c = await create(body(HOUR));
    expect(c.status).toBe(201);
    const id = c.body.id as string;
    const edit = await call(adminPATCH as H, 'PATCH', {
      headers: admin,
      id,
      body: { ...body(HOUR), choices: ['Car', 'Bus'] },
    });
    expect(edit.status).toBe(200);
    expect(await db.pollChoice.count({ where: { pollId: id } })).toBe(2);
    expect((await call(adminDELETE as H, 'DELETE', { headers: admin, id })).status).toBe(200);

    // Already open (the beforeEach poll): no edits, no delete, but it can end early.
    const late = await call(adminPATCH as H, 'PATCH', {
      headers: admin,
      id: pollId,
      body: body(HOUR),
    });
    expect(late.body.error.code).toBe('POLL_STARTED');
    expect((await call(adminDELETE as H, 'DELETE', { headers: admin, id: pollId })).status).toBe(
      409,
    );
    const me = await voter('poll_me');
    await vote(me.token, pollId, [choices[0]!]);
    expect((await call(adminEndPOST as H, 'POST', { headers: admin, id: pollId })).status).toBe(
      200,
    );
    expect(await db.pollVoter.count()).toBe(0); // counted right away
    expect(await db.adminAuditLog.count({ where: { action: { startsWith: 'POLL_' } } })).toBe(4);
  });

  it('builds the answers for each type', async () => {
    const yn = await create({
      kind: 'yes_no',
      topic: 'city',
      question: 'Should downtown get more bike lanes?',
      includeUnsure: true,
      ...dates(HOUR),
    });
    const scale = await create({
      kind: 'scale',
      topic: 'transport',
      question: 'How are the roads in your area?',
      lowLabel: 'Very poor',
      highLabel: 'Excellent',
      ...dates(HOUR),
    });
    const multi = await create({
      kind: 'multi',
      topic: 'food_fun',
      question: 'What did you do this weekend?',
      choices: ['Beach', 'Park', 'Game', 'Stayed in'],
      maxPicks: 2,
      ...dates(HOUR),
    });
    const answers = async (id: string) =>
      (await db.pollChoice.findMany({ where: { pollId: id }, orderBy: { position: 'asc' } })).map(
        (c) => [c.label, c.value],
      );
    expect(await answers(yn.body.id)).toEqual([
      ['Yes', null],
      ['No', null],
      ['Not sure', null],
    ]);
    expect(await answers(scale.body.id)).toEqual([
      ['1', 1],
      ['2', 2],
      ['3', 3],
      ['4', 4],
      ['5', 5],
    ]);
    const m = await db.poll.findUniqueOrThrow({ where: { id: multi.body.id } });
    expect(m).toMatchObject({ kind: 'MULTI', maxPicks: 2, topic: 'food_fun' });
    const s = await db.poll.findUniqueOrThrow({ where: { id: scale.body.id } });
    expect(s).toMatchObject({
      kind: 'SCALE',
      scaleLowLabel: 'Very poor',
      scaleHighLabel: 'Excellent',
    });
  });

  it('validates each type: answers, limits, labels, dates and the topic', async () => {
    const bad = [
      { ...body(HOUR), choices: ['Only one'] },
      { ...body(HOUR), choices: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] }, // pick one: up to 6
      { ...body(HOUR), choices: ['Car', 'car'] },
      { ...body(HOUR), topic: 'gossip' },
      { ...body(HOUR), maxPicks: 2 }, // only for pick several
      { ...body(HOUR), kind: 'multi', maxPicks: 4 }, // must be under the 4 answers
      { ...body(HOUR), kind: 'yes_no' }, // needs includeUnsure, has no choices
      { kind: 'scale', topic: 'city', question: 'Rate it please', lowLabel: 'Bad', ...dates(HOUR) },
      { ...body(HOUR), closesAt: new Date(Date.now() + HOUR + 60_000).toISOString() },
      { ...body(HOUR), closesAt: new Date(Date.now() + 40 * DAY).toISOString() },
      { ...body(HOUR), role: 'ADMIN' },
    ];
    for (const b of bad) expect((await create(b)).status).toBe(400);
  });

  // 🔒 Only admins, with the CSRF header.
  it('refuses app users and a missing CSRF token', async () => {
    const me = await voter('poll_me');
    const asUser = await call(adminCreatePOST as H, 'POST', { token: me.token, body: body(HOUR) });
    expect(asUser.status).toBe(401);
    const noCsrf = await call(adminCreatePOST as H, 'POST', {
      headers: { cookie: admin.cookie! },
      body: body(HOUR),
    });
    expect(noCsrf.status).toBe(403);
    expect(await db.poll.count()).toBe(1);
  });
});
