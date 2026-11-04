import { beforeEach, describe, expect, it } from 'vitest';
import { GET as auditGET } from '@/app/api/v1/admin/audit/route';
import { GET as listGET, POST as createPOST } from '@/app/api/v1/admin/giveaways/route';
import { GET as oneGET, POST as actPOST } from '@/app/api/v1/admin/giveaways/[id]/route';
import { POST as winnerPOST } from '@/app/api/v1/admin/giveaways/[id]/winners/[winnerId]/route';
import { GET as winsGET } from '@/app/api/v1/me/giveaways/route';
import { POST as respondPOST } from '@/app/api/v1/me/giveaways/[id]/route';
import { GET as bellGET } from '@/app/api/v1/notifications/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { recordActiveDay, resetActiveDayCache } from '@/server/active-days';
import { maskEmail, pickWeighted } from '@/server/giveaways';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D188: giveaways from the admin portal: criteria, draw or hand pick, the winner's answer
// in the app, and the email shown only after they accept.
const DAY = 86_400_000;
const HERE = { latitude: 30.3149, longitude: -81.6853 };

let admin: Record<string, string>;
let adminId: string;
// The entry period: 20 to 10 days ago (over, so winners can be picked).
const START = () => new Date(Date.now() - 20 * DAY);
const END = () => new Date(Date.now() - 10 * DAY);
const inPeriod = (dayOffset: number) => new Date(START().getTime() + dayOffset * DAY + 3_600_000);

async function person(name: string, extra: Record<string, unknown> = {}) {
  const u = await createTestUser(name, {
    emailVerifiedAt: new Date(),
    createdAt: new Date(Date.now() - 60 * DAY),
    email: `${name}@example.test`,
    ...extra,
  });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
}

/** Visible area posts on the given days of the entry period. */
async function postsOn(userId: string, days: number[]) {
  for (const [i, d] of days.entries()) {
    await db.$executeRaw`
      INSERT INTO "GeneralPost" (id, "authorId", body, location, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${userId}::uuid, ${`post ${userId} ${i}`},
              ST_SetSRID(ST_MakePoint(${HERE.longitude}, ${HERE.latitude}), 4326)::geography,
              ${inPeriod(d)}, now())`;
  }
}

const create = (body: Record<string, unknown>, headers = admin) =>
  call(createPOST as H, 'POST', {
    headers,
    body: {
      title: 'Launch giveaway',
      prize: '$25 gift card',
      startsAt: START().toISOString(),
      endsAt: END().toISOString(),
      pickMethod: 'RANDOM',
      winnerCount: 1,
      ...body,
    },
  });
async function newGiveaway(body: Record<string, unknown> = {}) {
  const r = await create(body);
  expect(r.status).toBe(201);
  return r.body.id as string;
}
const act = (id: string, body: Record<string, unknown>) =>
  call(actPOST as H, 'POST', { headers: admin, id, body });
const get = (id: string) => call(oneGET as H, 'GET', { headers: admin, id });
const poolNames = async (id: string) =>
  ((await get(id)).body.pool.rows as { username: string }[]).map((r) => r.username).sort();
const onWinner = (id: string, winnerId: string, body: Record<string, unknown>) =>
  call(winnerPOST as H, 'POST', { headers: admin, params: { id, winnerId }, body });
const respond = (token: string, id: string, accept: boolean) =>
  call(respondPOST as H, 'POST', { token, id, body: { accept } });

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  invalidateConfigCache();
  await importServiceArea(db, readBoundaryFile());
  adminId = (await createTestUser('gw_admin', { role: 'ADMIN' })).id;
  admin = await adminHeaders(adminId);
});

describe('creating giveaways', () => {
  it('checks the form and is for admins only', async () => {
    expect(
      (await create({ endsAt: START().toISOString(), startsAt: END().toISOString() })).status,
    ).toBe(400);
    expect((await create({ winnerCount: 0 })).status).toBe(400);
    expect((await create({ surprise: true })).status).toBe(400);
    const u = await person('gw_nosy');
    expect((await call(createPOST as H, 'POST', { token: u.token, body: {} })).status).toBe(401);
    expect((await call(listGET as H, 'GET', { token: u.token })).status).toBe(401);
    const id = await newGiveaway({ minPosts: 3 });
    const list = await call(listGET as H, 'GET', { headers: admin });
    expect(list.body.giveaways).toMatchObject([{ id, minPosts: 3, phase: 'Ended' }]);
  });
});

describe('who is eligible', () => {
  it('applies posting, comment, place, email, strike, join-date and age criteria', async () => {
    const busy = await person('gw_busy');
    await postsOn(busy.id, [0, 1, 2]);
    const oneDay = await person('gw_oneday');
    await postsOn(oneDay.id, [3, 3, 3]); // three posts, one day
    const quiet = await person('gw_quiet');
    const unconfirmed = await person('gw_unconfirmed', { emailVerifiedAt: null });
    await postsOn(unconfirmed.id, [0, 1, 2]);
    const banned = await person('gw_banned', { status: 'BANNED' });
    await postsOn(banned.id, [0, 1, 2]);
    await postsOn(adminId, [0, 1, 2]); // admins never win

    const posting = await newGiveaway({ minPosts: 3, minPostDays: 2 });
    expect(await poolNames(posting)).toEqual(['gw_busy']);
    const anyPosts = await newGiveaway({ minPosts: 3 });
    expect(await poolNames(anyPosts)).toEqual(['gw_busy', 'gw_oneday']);
    const loose = await newGiveaway({ requireConfirmedEmail: false, minPosts: 3, minPostDays: 3 });
    expect(await poolNames(loose)).toEqual(['gw_busy', 'gw_unconfirmed']);

    // Comments and approved place suggestions in the entry period.
    const post = await db.generalPost.findFirstOrThrow({ where: { authorId: busy.id } });
    await db.comment.create({
      data: {
        generalPostId: post.id,
        authorUserId: quiet.id,
        authorKind: 'USER',
        body: 'nice',
        createdAt: inPeriod(1),
      },
    });
    const commenters = await newGiveaway({ minComments: 1 });
    expect(await poolNames(commenters)).toEqual(['gw_quiet']);
    await db.$executeRaw`
      INSERT INTO "BusinessSubmission" (id, "submitterId", name, "nameNormalized", category,
        latitude, longitude, location, status, "createdAt", "updatedAt")
      VALUES (gen_random_uuid(), ${oneDay.id}::uuid, 'Cafe', 'cafe', 'cafe', ${HERE.latitude},
        ${HERE.longitude}, ST_SetSRID(ST_MakePoint(${HERE.longitude}, ${HERE.latitude}), 4326)::geography,
        'APPROVED', ${inPeriod(2)}, now())`;
    const places = await newGiveaway({ minApprovedPlaces: 1 });
    expect(await poolNames(places)).toEqual(['gw_oneday']);

    // A strike still counting, joined dates and account age.
    await db.moderationAction.create({
      data: { adminId, targetUserId: oneDay.id, action: 'WARN', reason: 'Spam' },
    });
    const clean = await newGiveaway({ minPosts: 3, requireNoStrikes: true });
    expect(await poolNames(clean)).toEqual(['gw_busy']);
    const newbie = await person('gw_newbie', { createdAt: inPeriod(1) });
    const joined = await newGiveaway({ joinedAfter: START().toISOString() });
    expect(await poolNames(joined)).toEqual(['gw_newbie']);
    const aged = await newGiveaway({ minAccountAgeDays: 30 });
    expect(await poolNames(aged)).not.toContain('gw_newbie');
    expect(newbie.id).toBeTruthy();
  });
});

describe('picking winners', () => {
  it('draws at random once the period ends, fills only open slots, and redraws', async () => {
    const people = await Promise.all(['gw_a', 'gw_b', 'gw_c'].map((n) => person(n)));
    const open = await newGiveaway({ endsAt: new Date(Date.now() + DAY).toISOString() });
    expect((await act(open, { action: 'draw' })).body.error.code).toBe('STILL_OPEN');

    const id = await newGiveaway({ winnerCount: 2 });
    const drawn = await act(id, { action: 'draw' });
    expect(drawn.status).toBe(200);
    expect(drawn.body.result).toEqual({ drawn: 2, poolSize: 3, poolTickets: 3 });
    expect((await act(id, { action: 'draw' })).body.error.code).toBe('NO_OPEN_SLOTS');
    expect((await act(id, { action: 'pick', username: 'gw_a' })).body.error.code).toBe(
      'WRONG_PICK_METHOD',
    );

    // A winner who declines frees the slot; the redraw takes the one left.
    const winners = await db.giveawayWinner.findMany({ where: { giveawayId: id } });
    const first = people.find((p) => p.id === winners[0]!.userId)!;
    expect((await respond(first.token, winners[0]!.id, false)).status).toBe(200);
    const again = await act(id, { action: 'draw' });
    expect(again.body.result).toEqual({ drawn: 1, poolSize: 1, poolTickets: 1 });
    const all = await db.giveawayWinner.findMany({ where: { giveawayId: id } });
    expect(new Set(all.map((w) => w.userId)).size).toBe(3);
    expect(await db.notification.count({ where: { type: 'GIVEAWAY_WIN' } })).toBe(3);
  });

  it('🔒 a hand pick must be eligible', async () => {
    await person('gw_ok');
    await person('gw_unconfirmed2', { emailVerifiedAt: null });
    const id = await newGiveaway({ pickMethod: 'MANUAL' });
    expect((await act(id, { action: 'draw' })).body.error.code).toBe('WRONG_PICK_METHOD');
    for (const username of ['gw_unconfirmed2', 'gw_admin', 'nobody_here']) {
      const r = await act(id, { action: 'pick', username });
      expect(r.status).toBe(409);
      expect(r.body.error.code).toBe('NOT_ELIGIBLE');
    }
    expect((await act(id, { action: 'pick', username: '@GW_OK' })).body.result.drawn).toBe(1);
    expect(await db.giveawayWinner.count()).toBe(1);
  });

  it('can leave out past winners', async () => {
    const champ = await person('gw_champ');
    await person('gw_other');
    const first = await newGiveaway({ pickMethod: 'MANUAL' });
    await act(first, { action: 'pick', username: 'gw_champ' });
    const w = await db.giveawayWinner.findFirstOrThrow();
    await respond(champ.token, w.id, true);
    expect(await poolNames(await newGiveaway())).toEqual(['gw_champ', 'gw_other']);
    expect(await poolNames(await newGiveaway({ excludePastWinners: true }))).toEqual(['gw_other']);
  });

  it('picks without repeats; more tickets, more chances', () => {
    const even = new Map<string, number>();
    for (let i = 0; i < 3000; i++) {
      const picked = pickWeighted(
        ['a', 'b', 'c'].map((id) => ({ id, tickets: 1 })),
        2,
      );
      expect(new Set(picked.map((p) => p.id)).size).toBe(2);
      for (const p of picked) even.set(p.id, (even.get(p.id) ?? 0) + 1);
    }
    for (const n of even.values()) expect(n).toBeGreaterThan(1800); // 2000 expected each
    let heavy = 0;
    for (let i = 0; i < 4000; i++) {
      const [p] = pickWeighted(
        [
          { id: 'many', tickets: 9 },
          { id: 'one', tickets: 1 },
        ],
        1,
      );
      if (p!.id === 'many') heavy++;
    }
    expect(heavy).toBeGreaterThan(3400); // 3600 expected (90 %)
    expect(heavy).toBeLessThan(3800);
    expect(pickWeighted([{ id: 'x', tickets: 0 }], 1)).toEqual([]);
  });

  it('gives a ticket for each day someone opened the app in the entry period', async () => {
    resetActiveDayCache();
    const fan = await person('gw_fan');
    const rare = await person('gw_rare');
    await person('gw_never');
    // Days are Jacksonville dates: 9 days in the period for one, 1 for the other, 1 outside.
    for (let d = 0; d < 9; d++) await recordActiveDay(fan.id, inPeriod(d));
    await recordActiveDay(fan.id, inPeriod(0)); // same day again: still one
    await recordActiveDay(rare.id, inPeriod(4));
    await recordActiveDay(rare.id, new Date(Date.now() - 2 * DAY)); // after the period
    expect(await db.userActiveDay.count({ where: { userId: fan.id } })).toBe(9);

    const id = await newGiveaway({ ticketsPerActiveDay: true, minActiveDays: 1 });
    const g = await get(id);
    expect(g.body.pool.total).toBe(2);
    expect(g.body.pool.tickets).toBe(10);
    const rows = Object.fromEntries(
      (g.body.pool.rows as { username: string; activeDays: number; tickets: number }[]).map((r) => [
        r.username,
        r,
      ]),
    );
    expect(rows.gw_fan).toMatchObject({ activeDays: 9, tickets: 9 });
    expect(rows.gw_rare).toMatchObject({ activeDays: 1, tickets: 1 });

    const drawn = await act(id, { action: 'draw' });
    expect(drawn.body.result).toMatchObject({ drawn: 1, poolSize: 2, poolTickets: 10 });
    const w = await db.giveawayWinner.findFirstOrThrow({ where: { giveawayId: id } });
    expect(w.poolTickets).toBe(10);
    expect([1, 9]).toContain(w.tickets);

    // Without the option everyone eligible has one ticket.
    const flat = await get(await newGiveaway());
    expect(flat.body.pool.tickets).toBe(flat.body.pool.total);
  });

  it('records a day when a signed-in person uses the app', async () => {
    resetActiveDayCache();
    const u = await person('gw_user');
    await call(winsGET as H, 'GET', { token: u.token });
    await call(winsGET as H, 'GET', { token: u.token });
    expect(await db.userActiveDay.count({ where: { userId: u.id } })).toBe(1);
  });
});

describe('the winner', () => {
  async function won() {
    const winner = await person('gw_winner');
    const id = await newGiveaway({ pickMethod: 'MANUAL', title: 'Fall giveaway' });
    await act(id, { action: 'pick', username: 'gw_winner' });
    const w = await db.giveawayWinner.findFirstOrThrow();
    return { winner, id, winId: w.id };
  }

  it('sees it in the bell and in their wins, with their email masked', async () => {
    const { winner, winId } = await won();
    const bell = await call(bellGET as H, 'GET', { token: winner.token });
    expect(bell.body.notifications).toMatchObject([
      { type: 'GIVEAWAY_WIN', actor: null, giveaway: { winId, title: 'Fall giveaway' } },
    ]);
    const wins = await call(winsGET as H, 'GET', { token: winner.token });
    expect(wins.body.wins).toMatchObject([
      { id: winId, prize: '$25 gift card', status: 'NOTIFIED', maskedEmail: 'g•••@example.test' },
    ]);
    expect(wins.raw).not.toContain('gw_winner@example.test');
    expect(maskEmail('jo@x.com')).toBe('j•••@x.com');
  });

  it('🔒 only the winner can answer, once, and before the deadline', async () => {
    const { winner, winId } = await won();
    const other = await person('gw_other2');
    expect((await respond(other.token, winId, true)).status).toBe(404);
    expect((await respond(winner.token, winId, true)).status).toBe(200);
    expect((await respond(winner.token, winId, false)).status).toBe(409);
    expect((await db.giveawayWinner.findUniqueOrThrow({ where: { id: winId } })).status).toBe(
      'ACCEPTED',
    );
    expect(
      (await db.notification.findFirstOrThrow({ where: { giveawayWinnerId: winId } })).readAt,
    ).not.toBeNull();

    const late = await won2();
    await db.giveawayWinner.update({
      where: { id: late.winId },
      data: { respondBy: new Date(Date.now() - 1000) },
    });
    expect((await respond(late.winner.token, late.winId, true)).status).toBe(409);
    expect((await db.giveawayWinner.findUniqueOrThrow({ where: { id: late.winId } })).status).toBe(
      'EXPIRED',
    );
  });

  async function won2() {
    const winner = await person('gw_late');
    const id = await newGiveaway({ pickMethod: 'MANUAL' });
    await act(id, { action: 'pick', username: 'gw_late' });
    const w = await db.giveawayWinner.findFirstOrThrow({ where: { giveawayId: id } });
    return { winner, winId: w.id };
  }

  it('🔒 the email is shown only after they accept, with the reason audited', async () => {
    const { winner, id, winId } = await won();
    const early = await onWinner(id, winId, { action: 'revealEmail', reason: 'Send gift card' });
    expect(early.status).toBe(409);
    expect((await get(id)).raw).not.toContain('@example.test');

    await respond(winner.token, winId, true);
    expect((await onWinner(id, winId, { action: 'revealEmail' })).status).toBe(400);
    const shown = await onWinner(id, winId, { action: 'revealEmail', reason: 'Send gift card' });
    expect(shown.body.result).toEqual({ email: 'gw_winner@example.test' });
    const log = await call(auditGET as H, 'GET', { headers: admin });
    expect(log.body.entries[0]).toMatchObject({ action: 'GIVEAWAY_EMAIL_REVEAL' });
    expect(JSON.stringify(log.body.entries[0])).toContain('Send gift card');
    expect(JSON.stringify(log.body.entries)).not.toContain('@example.test');

    // Someone else's giveaway id with this winner: not found.
    const otherGiveaway = await newGiveaway();
    expect(
      (await onWinner(otherGiveaway, winId, { action: 'revealEmail', reason: 'x y z' })).status,
    ).toBe(404);

    expect((await onWinner(id, winId, { action: 'prizeSent', note: 'Order 123' })).status).toBe(
      200,
    );
    const after = await get(id);
    expect(after.body.giveaway.winners[0]).toMatchObject({
      status: 'PRIZE_SENT',
      adminNote: 'Order 123',
    });
    expect(after.body.phase).toBe('Completed');
  });

  it('disqualifying frees the slot; a cancelled giveaway can no longer be answered', async () => {
    const { winner, id, winId } = await won();
    expect(
      (await onWinner(id, winId, { action: 'disqualify', reason: 'Duplicate account' })).status,
    ).toBe(200);
    expect((await get(id)).body.openSlots).toBe(1);
    expect((await respond(winner.token, winId, true)).status).toBe(409);

    const second = await won2();
    const g = (await db.giveawayWinner.findUniqueOrThrow({ where: { id: second.winId } }))
      .giveawayId;
    expect((await act(g, { action: 'cancel', reason: 'Prize fell through' })).status).toBe(200);
    expect((await respond(second.winner.token, second.winId, true)).status).toBe(409);
    expect((await act(g, { action: 'pick', username: 'gw_other' })).body.error.code).toBe(
      'GIVEAWAY_CANCELLED',
    );
  });
});
