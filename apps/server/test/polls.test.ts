import { beforeEach, describe, expect, it } from 'vitest';
import { POST as adminCreatePOST } from '@/app/api/v1/admin/polls/route';
import { POST as adminEndPOST } from '@/app/api/v1/admin/polls/[id]/end/route';
import { DELETE as adminDELETE, PATCH as adminPATCH } from '@/app/api/v1/admin/polls/[id]/route';
import { POST as guestsPOST } from '@/app/api/v1/guests/route';
import { POST as installPOST } from '@/app/api/v1/installations/route';
import { GET as pollGET } from '@/app/api/v1/polls/[id]/route';
import { GET as pollsGET } from '@/app/api/v1/polls/route';
import { POST as votePOST } from '@/app/api/v1/polls/[id]/vote/route';
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

// D123: weekly polls.
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

async function newPoll(opts: { opensIn?: number; closesIn?: number } = {}) {
  const p = await db.poll.create({
    data: {
      question: 'Which bridge do you cross most?',
      opensAt: new Date(Date.now() + (opts.opensIn ?? -HOUR)),
      closesAt: new Date(Date.now() + (opts.closesIn ?? DAY)),
      choices: {
        create: ['Main Street', 'Acosta', 'Fuller Warren'].map((label, position) => ({
          label,
          position,
        })),
      },
    },
    include: { choices: { orderBy: { position: 'asc' } } },
  });
  return { id: p.id, choices: p.choices.map((c) => c.id) };
}

const vote = (token: string, id: string, choiceId: string, at = IN) =>
  call(votePOST as H, 'POST', { token, id, body: { reading: reading(at), choiceId } });

beforeEach(async () => {
  await resetDb();
  await importServiceArea(db, readBoundaryFile());
  await importZipAreas(db);
  ({ id: pollId, choices } = await newPoll());
}, 60_000); // the county and ZIP outlines take a while to load

describe('voting', () => {
  it('one final vote; you see your own choice while open, but no totals', async () => {
    const me = await voter('poll_me');
    const r = await vote(me.token, pollId, choices[1]!);
    expect(r.status).toBe(200);
    expect(r.body.poll).toMatchObject({ status: 'open', myChoiceId: choices[1], results: null });
    const again = await vote(me.token, pollId, choices[0]!);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('ALREADY_VOTED');
    const list = await call(pollsGET as H, 'GET', { token: me.token });
    expect(list.body.open[0]).toMatchObject({ id: pollId, myChoiceId: choices[1], results: null });
  });

  it('the vote stores a code and a ZIP, never the account ID or the time', async () => {
    const me = await voter('poll_me');
    await vote(me.token, pollId, choices[0]!);
    const [ballot] = await db.$queryRaw<Record<string, unknown>[]>`SELECT * FROM "PollBallot"`;
    expect(Object.keys(ballot!).sort()).toEqual(['choiceId', 'pollId', 'voterCode', 'zip']);
    expect(ballot!.zip).toMatch(/^\d{5}$/);
    expect(JSON.stringify(ballot)).not.toContain(me.id);
  });

  // 🔒 Who may vote.
  it('refuses guests, unconfirmed and brand-new accounts, and readings outside Duval', async () => {
    const inst = (await call(installPOST as H, 'POST', { body: {} })).body.installationToken;
    const guest = await call(guestsPOST as H, 'POST', {
      body: {},
      headers: { [INSTALLATION_HEADER]: inst },
    });
    expect((await vote(guest.body.token, pollId, choices[0]!)).status).toBe(403); // accounts only

    const unconfirmed = await voter('poll_unconf', { verified: false });
    expect((await vote(unconfirmed.token, pollId, choices[0]!)).status).toBe(403);

    const fresh = await voter('poll_fresh', { days: 1 });
    const r1 = await vote(fresh.token, pollId, choices[0]!);
    expect(r1.body.error.code).toBe('ACCOUNT_TOO_NEW');

    const away = await voter('poll_away');
    const r2 = await vote(away.token, pollId, choices[0]!, OUT);
    expect(r2.status).toBe(403);
    expect(r2.body.error.code).toBe('LOCATION_OUTSIDE_AREA');
    expect(await db.pollBallot.count()).toBe(0);
  });

  it('refuses a choice from another poll, a poll that hasn’t opened, and a closed poll', async () => {
    const me = await voter('poll_me');
    const other = await newPoll();
    expect((await vote(me.token, pollId, other.choices[0]!)).body.error.code).toBe(
      'INVALID_CHOICE',
    );
    const later = await newPoll({ opensIn: HOUR, closesIn: DAY });
    expect((await vote(me.token, later.id, later.choices[0]!)).status).toBe(404);
    const done = await newPoll({ opensIn: -2 * DAY, closesIn: -HOUR });
    expect((await vote(me.token, done.id, done.choices[0]!)).body.error.code).toBe('POLL_CLOSED');
  });

  it('guests can read polls and, after closing, results', async () => {
    const inst = (await call(installPOST as H, 'POST', { body: {} })).body.installationToken;
    const guest = await call(guestsPOST as H, 'POST', {
      body: {},
      headers: { [INSTALLATION_HEADER]: inst },
    });
    const list = await call(pollsGET as H, 'GET', { token: guest.body.token });
    expect(list.status).toBe(200);
    expect(list.body.open[0]).toMatchObject({ id: pollId, myChoiceId: null });
    expect((await call(pollsGET as H, 'GET', {})).status).toBe(401);
  });

  it('a poll that hasn’t opened is invisible to the app', async () => {
    const me = await voter('poll_me');
    const later = await newPoll({ opensIn: HOUR });
    const list = await call(pollsGET as H, 'GET', { token: me.token });
    expect(list.body.open.map((p: { id: string }) => p.id)).toEqual([pollId]);
    expect((await call(pollGET as H, 'GET', { token: me.token, id: later.id })).status).toBe(404);
  });
});

describe('closing and counting', () => {
  it('turns votes into totals, deletes them and destroys the key', async () => {
    const people = await Promise.all([1, 2, 3].map((i) => voter(`poll_v${i}`)));
    await vote(people[0]!.token, pollId, choices[0]!);
    await vote(people[1]!.token, pollId, choices[0]!);
    await vote(people[2]!.token, pollId, choices[2]!);
    expect(await db.pollKey.count()).toBe(1);
    await db.poll.update({ where: { id: pollId }, data: { closesAt: new Date(Date.now() - 1) } });
    expect((await runMaintenance())?.pollsCounted).toBe(1);
    expect(await db.pollBallot.count()).toBe(0);
    expect(await db.pollKey.count()).toBe(0);
    expect((await db.poll.findUniqueOrThrow({ where: { id: pollId } })).voterCount).toBe(3);
    const r = await call(pollGET as H, 'GET', { token: people[0]!.token, id: pollId });
    expect(r.body.poll).toMatchObject({ status: 'closed', myChoiceId: null });
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
        await castPollVote(u.id, pollId, choices[choice]!, at(spot));
      }
    };
    await many(8, 0, 0);
    await many(4, 0, 1); // ZIP A: 12 voters
    await many(6, 1, 2); // ZIP B: 6
    await many(5, 2, 1); // ZIP C: 5 (B + C = 11 "other areas")
    await db.poll.update({ where: { id: pollId }, data: { closesAt: new Date(Date.now() - 1) } });
    await finalizeDuePolls();
    const p = await db.poll.findUniqueOrThrow({
      where: { id: pollId },
      include: { choices: { orderBy: { position: 'asc' } }, tallies: true },
    });
    const res = buildResults(p.choices, p.tallies);
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
      },
    ]);
    expect(res.otherAreas).toMatchObject({ voters: 11 });
    // Without ZIP C, "other areas" would be 6 people: hidden.
    const fewer = buildResults(
      p.choices,
      p.tallies.filter((t) => t.zip !== spots[2]!.zip),
    );
    expect(fewer.otherAreas).toBeNull();
  });
});

describe('admin', () => {
  let admin: Record<string, string>;
  const body = (opensIn: number) => ({
    question: 'How do you get downtown?',
    choices: ['Car', 'Bus', 'Bike', 'Walk'],
    opensAt: new Date(Date.now() + opensIn).toISOString(),
    closesAt: new Date(Date.now() + opensIn + 7 * DAY).toISOString(),
  });

  beforeEach(async () => {
    admin = await adminHeaders((await createTestUser('poll_admin', { role: 'ADMIN' })).id);
  });

  it('creates a poll; edits and deletes only before it opens; ends one early', async () => {
    const c = await call(adminCreatePOST as H, 'POST', { headers: admin, body: body(HOUR) });
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
    await vote(me.token, pollId, choices[0]!);
    expect((await call(adminEndPOST as H, 'POST', { headers: admin, id: pollId })).status).toBe(
      200,
    );
    expect(await db.pollBallot.count()).toBe(0); // counted right away
    expect(await db.adminAuditLog.count({ where: { action: { startsWith: 'POLL_' } } })).toBe(4);
  });

  it('validates the poll: 2–6 different choices, at least an hour, at most 31 days', async () => {
    const bad = [
      { ...body(HOUR), choices: ['Only one'] },
      { ...body(HOUR), choices: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] },
      { ...body(HOUR), choices: ['Car', 'car'] },
      { ...body(HOUR), closesAt: new Date(Date.now() + HOUR + 60_000).toISOString() },
      { ...body(HOUR), closesAt: new Date(Date.now() + 40 * DAY).toISOString() },
      { ...body(HOUR), role: 'ADMIN' },
    ];
    for (const b of bad) {
      expect((await call(adminCreatePOST as H, 'POST', { headers: admin, body: b })).status).toBe(
        400,
      );
    }
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
