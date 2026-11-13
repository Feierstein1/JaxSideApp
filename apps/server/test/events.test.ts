import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { localDate, localTime } from '@jax/shared';
import { POST as caseDecidePOST } from '@/app/api/v1/admin/cases/[type]/[id]/route';
import { POST as adminCopyPOST } from '@/app/api/v1/admin/events/[id]/copy/route';
import { POST as adminDecidePOST } from '@/app/api/v1/admin/events/[id]/decide/route';
import { PATCH as adminEditPATCH } from '@/app/api/v1/admin/events/[id]/route';
import { POST as adminCreatePOST } from '@/app/api/v1/admin/events/route';
import { POST as dayPOST } from '@/app/api/v1/events/day/route';
import { POST as comingUpPOST } from '@/app/api/v1/events/coming-up/route';
import { DELETE as unfollowDELETE, PUT as followPUT } from '@/app/api/v1/events/[id]/follow/route';
import { POST as detailPOST } from '@/app/api/v1/events/[id]/route';
import { POST as listPOST } from '@/app/api/v1/events/list/route';
import { POST as monthPOST } from '@/app/api/v1/events/month/route';
import { GET as hostInfoGET } from '@/app/api/v1/events/host-info/route';
import { POST as guestsPOST } from '@/app/api/v1/guests/route';
import { POST as installPOST } from '@/app/api/v1/installations/route';
import { GET as badgesGET } from '@/app/api/v1/badges/route';
import { GET as notificationsGET } from '@/app/api/v1/notifications/route';
import { POST as reportPOST } from '@/app/api/v1/reports/route';
import { POST as chatSendPOST } from '@/app/api/v1/events/[id]/chat/route';
import { POST as chatJoinPOST } from '@/app/api/v1/events/[id]/chat/join/route';
import { POST as chatListPOST } from '@/app/api/v1/events/[id]/chat/list/route';
import { POST as chatStatusPOST } from '@/app/api/v1/events/[id]/chat/status/route';
import { countEventDays, purgeEventChat } from '@/server/events/chat';
import { POST as adsPOST } from '@/app/api/v1/ads/route';
import { resetAdCache } from '@/server/ads/serve';
import { ensureTiers } from '@/server/plan-tiers';
import { POST as organizerPOST } from '@/app/api/v1/admin/organizers/[id]/route';
import { listCases } from '@/server/admin/queue';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { INSTALLATION_HEADER } from '@/server/installations';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { findForbiddenKeys } from '@/server/serializers';
import { importZipAreas } from '@/server/stats/zip-areas';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D230: events and the event calendar (P18.1–P18.6).

const DAY = 86_400_000;
const DOWNTOWN = { latitude: 30.3274, longitude: -81.6588 };
const RIVERSIDE = { latitude: 30.3108, longitude: -81.6905 }; // ~3.3 km from downtown
const JAX_BEACH = { latitude: 30.2866, longitude: -81.3934 }; // ~25 km away, still in Duval
const ST_AUGUSTINE = { latitude: 29.8947, longitude: -81.3145 }; // outside Duval
const reading = (at = DOWNTOWN) => ({ ...at, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

/** A Jacksonville date this many days from now. */
const inDays = (n: number) => localDate(new Date(Date.now() + n * DAY));

let admin: Record<string, string>;
let adminId: string;
let me: { id: string; token: string };
let other: { id: string; token: string };

async function person(name: string, extra: Record<string, unknown> = {}) {
  const u = await createTestUser(name, {
    emailVerifiedAt: new Date(),
    createdAt: new Date(Date.now() - 10 * DAY),
    ...extra,
  });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
}

const base = (over: Record<string, unknown> = {}) => ({
  title: 'Riverside PorchFest',
  description: 'Bands on porches all over Riverside.',
  category: 'music',
  setting: 'outdoor',
  free: true,
  ...RIVERSIDE,
  sessions: [{ date: inDays(3), start: '12:00', end: '20:00' }],
  ...over,
});

async function addEvent(over: Record<string, unknown> = {}) {
  const r = await call(adminCreatePOST as H, 'POST', { headers: admin, body: base(over) });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  return r.body.id as string;
}

const month = (token: string, body: Record<string, unknown>, at = DOWNTOWN) =>
  call(monthPOST as H, 'POST', { token, body: { reading: reading(at), ...body } });
const day = (token: string, body: Record<string, unknown>, at = DOWNTOWN) =>
  call(dayPOST as H, 'POST', { token, body: { reading: reading(at), ...body } });
const list = (token: string, body: Record<string, unknown> = {}, at = DOWNTOWN) =>
  call(listPOST as H, 'POST', { token, body: { reading: reading(at), ...body } });
const detail = (token: string, id: string, at = DOWNTOWN) =>
  call(detailPOST as H, 'POST', { token, id, body: { reading: reading(at) } });
const decide = (id: string, body: Record<string, unknown>) =>
  call(adminDecidePOST as H, 'POST', { headers: admin, id, body });
const titles = (r: { body: { items: { title: string }[] } }) => r.body.items.map((e) => e.title);

beforeAll(async () => {
  await resetDb();
  await importZipAreas(db);
});

beforeEach(async () => {
  // ZIP outlines are slow to import, so they're loaded once and kept between tests.
  const keep = new Set(['_prisma_migrations', 'spatial_ref_sys', 'ZipArea']);
  const rows = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'`;
  const list = rows
    .filter((r) => !keep.has(r.tablename))
    .map((r) => `"public"."${r.tablename}"`)
    .join(', ');
  await db.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
  await relaxBurstLimits();
  await importServiceArea(db, readBoundaryFile());
  invalidateConfigCache();
  const a = await createTestUser('boss', { role: 'ADMIN', emailVerifiedAt: new Date() });
  adminId = a.id;
  admin = await adminHeaders(a.id);
  me = await person('me_user');
  other = await person('other_user');
});

describe('adding events (P18.1, P18.2)', () => {
  it('an admin adds an event: approved at once, with its ZIP, neighborhood and dates', async () => {
    const id = await addEvent();
    const e = await db.event.findUniqueOrThrow({ where: { id }, include: { sessions: true } });
    expect(e.status).toBe('APPROVED');
    expect(e.zip).toMatch(/^322\d\d$/);
    expect(e.neighborhood).toBeTruthy();
    expect(e.sessions).toHaveLength(1);
    // The database keeps the first start and last end in step with the sessions.
    expect(e.firstStartsAt?.getTime()).toBe(e.sessions[0]!.startsAt.getTime());
    expect(localTime(e.sessions[0]!.startsAt)).toBe('12:00');
  });

  it('🔒 refuses a pin outside Duval, and non-admins', async () => {
    const r = await call(adminCreatePOST as H, 'POST', {
      headers: admin,
      body: base(ST_AUGUSTINE),
    });
    expect(r.body.error.code).toBe('OUTSIDE_SERVICE_AREA');
    const plain = await call(adminCreatePOST as H, 'POST', { token: me.token, body: base() });
    expect(plain.status).toBe(401);
    expect(await db.event.count()).toBe(0);
  });

  it('editing keeps sessions whose start is unchanged, and tells followers about changes', async () => {
    const id = await addEvent({
      sessions: [
        { date: inDays(3), start: '12:00', end: '20:00' },
        { date: inDays(4), start: '12:00', end: '18:00' },
      ],
    });
    const kept = await db.eventSession.findFirstOrThrow({
      where: { eventId: id },
      orderBy: { startsAt: 'asc' },
    });
    await call(followPUT as H, 'PUT', { token: me.token, id });
    const r = await call(adminEditPATCH as H, 'PATCH', {
      headers: admin,
      id,
      body: base({
        sessions: [
          { date: inDays(3), start: '12:00', end: '21:00' },
          { date: inDays(5), start: '10:00', end: '14:00' },
        ],
      }),
    });
    expect(r.status).toBe(200);
    const now = await db.eventSession.findMany({
      where: { eventId: id },
      orderBy: { startsAt: 'asc' },
    });
    expect(now).toHaveLength(2);
    expect(now[0]!.id).toBe(kept.id);
    expect(localTime(now[0]!.endsAt)).toBe('21:00');
    expect(await db.notification.count({ where: { userId: me.id, type: 'EVENT_CHANGED' } })).toBe(
      1,
    );
  });

  it('Repeat yearly copies the event a year later, waiting for review', async () => {
    const id = await addEvent();
    const r = await call(adminCopyPOST as H, 'POST', { headers: admin, id, body: { years: 1 } });
    expect(r.status).toBe(201);
    const copy = await db.event.findUniqueOrThrow({
      where: { id: r.body.id },
      include: { sessions: true },
    });
    expect(copy.status).toBe('IN_REVIEW');
    const date = localDate(copy.sessions[0]!.startsAt);
    expect(Number(date.slice(0, 4))).toBe(Number(inDays(3).slice(0, 4)) + 1);
    expect(date.slice(4)).toBe(inDays(3).slice(4));
  });
});

describe('the Events tab (P18.3)', () => {
  it('counts each day’s events for the calendar, cancelled ones left out', async () => {
    const d = inDays(3);
    await addEvent({ title: 'One' });
    await addEvent({ title: 'Two', sessions: [{ date: d, start: '18:00', end: '22:00' }] });
    const off = await addEvent({ title: 'Off' });
    await decide(off, { action: 'cancel', reason: 'Rained out' });
    const r = await month(me.token, { month: d.slice(0, 7) });
    expect(r.status).toBe(200);
    expect(r.body.days[d]).toBe(2);
    expect(r.body.today).toBe(localDate(new Date()));
  });

  it('a day groups by neighborhood (yours first), then by start time', async () => {
    const d = inDays(2);
    await addEvent({
      title: 'Beach late',
      ...JAX_BEACH,
      sessions: [{ date: d, start: '20:00', end: '22:00' }],
    });
    await addEvent({
      title: 'Downtown late',
      ...DOWNTOWN,
      sessions: [{ date: d, start: '19:00', end: '21:00' }],
    });
    await addEvent({
      title: 'Downtown early',
      ...DOWNTOWN,
      sessions: [{ date: d, start: '09:00', end: '11:00' }],
    });
    const r = await day(me.token, { date: d });
    expect(r.status).toBe(200);
    const groups = r.body.groups as { events: { title: string }[] }[];
    expect(groups[0]!.events.map((e) => e.title)).toEqual(['Downtown early', 'Downtown late']);
    expect(groups[groups.length - 1]!.events.map((e) => e.title)).toEqual(['Beach late']);
  });

  it('filters: nearby, business, indoor, free, search and followed', async () => {
    const beach = await addEvent({ title: 'Beach cleanup', ...JAX_BEACH, setting: 'outdoor' });
    await addEvent({ title: 'Paid show', free: false, priceText: '$10', setting: 'indoor' });
    await addEvent({ title: 'Free jazz', setting: 'mixed' });
    // Riverside is about 2 miles from downtown, so read from there.
    expect(titles(await list(me.token, { nearby: true }, RIVERSIDE)).sort()).toEqual([
      'Free jazz',
      'Paid show',
    ]);
    expect(titles(await list(me.token, { freeOnly: true })).sort()).toEqual([
      'Beach cleanup',
      'Free jazz',
    ]);
    expect(titles(await list(me.token, { setting: 'indoor' })).sort()).toEqual([
      'Free jazz',
      'Paid show',
    ]);
    expect(titles(await list(me.token, { q: 'cleanup' }))).toEqual(['Beach cleanup']);
    expect(titles(await list(me.token, { kind: 'business' }))).toEqual([]);
    await call(followPUT as H, 'PUT', { token: me.token, id: beach });
    expect(titles(await list(me.token, { following: true }))).toEqual(['Beach cleanup']);
  });

  it('lists upcoming sessions soonest first, a page at a time', async () => {
    for (let i = 1; i <= 3; i++) {
      await addEvent({
        title: `Event ${i}`,
        sessions: [{ date: inDays(i), start: '12:00', end: '13:00' }],
      });
    }
    const first = await list(me.token, { limit: 2 });
    expect(titles(first)).toEqual(['Event 1', 'Event 2']);
    const second = await list(me.token, { limit: 2, cursor: first.body.nextCursor });
    expect(titles(second)).toEqual(['Event 3']);
    expect(second.body.nextCursor).toBeNull();
  });

  it('an event page: details, follow count hidden under 10, nothing private', async () => {
    const id = await addEvent();
    await call(followPUT as H, 'PUT', { token: me.token, id });
    const r = await detail(me.token, id);
    expect(r.status).toBe(200);
    expect(r.body.event.title).toBe('Riverside PorchFest');
    expect(r.body.event.following).toBe(true);
    expect(r.body.event.followerCount).toBeNull();
    expect(r.body.event.sessions).toHaveLength(1);
    expect(findForbiddenKeys(r.body)).toEqual([]);
  });

  it('🔒 suggestions, events in review, denied and removed events are never served', async () => {
    const hidden = await addEvent({ title: 'Hidden' });
    const d = inDays(3);
    for (const status of ['SUGGESTED', 'DRAFT', 'IN_REVIEW', 'DENIED', 'REMOVED'] as const) {
      await db.event.update({ where: { id: hidden }, data: { status } });
      expect((await detail(me.token, hidden)).status).toBe(404);
      expect(titles(await list(me.token))).toEqual([]);
      expect((await month(me.token, { month: d.slice(0, 7) })).body.days[d]).toBeUndefined();
      expect((await day(me.token, { date: d })).body.groups).toEqual([]);
    }
  });

  it('🔒 reading needs a verified location inside Duval; guests can read', async () => {
    await addEvent();
    const out = await list(me.token, {}, ST_AUGUSTINE);
    expect(out.status).toBe(403);
    const inst = (await call(installPOST as H, 'POST', { body: {} })).body.installationToken;
    const g = await call(guestsPOST as H, 'POST', {
      body: {},
      headers: { [INSTALLATION_HEADER]: inst },
    });
    const r = await list(g.body.token);
    expect(r.status).toBe(200);
    expect(r.body.items[0].following).toBe(false);
    // Guests can't follow.
    expect(
      (await call(followPUT as H, 'PUT', { token: g.body.token, id: r.body.items[0].id })).status,
    ).toBe(403);
  });
});

describe('following and reminders (P18.4)', () => {
  it('reminds once the day before and within the hour, at the badge check', async () => {
    const soon = new Date(Date.now() + 30 * 60_000);
    const later = new Date(soon.getTime() + 90 * 60_000);
    const id = await addEvent({
      sessions: [{ date: localDate(soon), start: localTime(soon), end: localTime(later) }],
    });
    const tomorrow = await addEvent({
      title: 'Tomorrow show',
      sessions: [{ date: inDays(1), start: '19:00', end: '21:00' }],
    });
    await call(followPUT as H, 'PUT', { token: me.token, id });
    await call(followPUT as H, 'PUT', { token: me.token, id: tomorrow });
    await call(badgesGET as H, 'GET', { token: me.token });
    await call(badgesGET as H, 'GET', { token: me.token }); // once only
    const types = (await db.notification.findMany({ where: { userId: me.id } })).map((n) => n.type);
    expect(types.filter((t) => t === 'EVENT_SOON')).toHaveLength(1);
    // The 30-minute one is also "tomorrow" only if it crosses midnight; the other always is.
    expect(types.filter((t) => t === 'EVENT_TOMORROW').length).toBeGreaterThanOrEqual(1);
    const bell = await call(notificationsGET as H, 'GET', { token: me.token });
    const soonNote = bell.body.notifications.find((n: { type: string }) => n.type === 'EVENT_SOON');
    expect(soonNote.event.id).toBe(id);
    expect(soonNote.event.startTime).toBe(localTime(soon));
  });

  it('cancelling tells followers; unfollowing works on a cancelled event', async () => {
    const id = await addEvent();
    await call(followPUT as H, 'PUT', { token: me.token, id });
    await decide(id, { action: 'cancel', reason: 'Storm' });
    expect(await db.notification.count({ where: { userId: me.id, type: 'EVENT_CANCELLED' } })).toBe(
      1,
    );
    expect((await call(followPUT as H, 'PUT', { token: other.token, id })).status).toBe(404);
    expect(
      (await call(unfollowDELETE as H, 'DELETE', { token: me.token, id })).body.following,
    ).toBe(false);
  });
});

describe('posting events (D233)', () => {
  // 🔒 App users can't add events: the old suggestion route is gone, and the app only points
  // to JaxSide for Business.
  it('there is no way to suggest an event from the app; the screen says where to go', async () => {
    const r = await call(hostInfoGET as H, 'GET', { token: me.token });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body)).toEqual(['signupUrl']);
    const { existsSync } = await import('node:fs');
    const gone = new URL('../src/app/api/v1/events/suggestions/route.ts', import.meta.url);
    expect(existsSync(gone)).toBe(false);
  });
});

describe('reporting events (P18.6)', () => {
  it('reports go to the admin queue as an event case; removing takes it off the calendar', async () => {
    const id = await addEvent();
    const bad = await call(reportPOST as H, 'POST', {
      token: me.token,
      body: { reading: reading(), target: { type: 'event', id }, reason: 'AD_MISLEADING' },
    });
    expect(bad.status).toBe(400);
    const r = await call(reportPOST as H, 'POST', {
      token: me.token,
      body: { reading: reading(), target: { type: 'event', id }, reason: 'EVENT_FAKE' },
    });
    expect(r.status).toBe(202);
    const cases = await listCases();
    expect(cases.rows.map((c) => [c.type, c.id])).toEqual([['event', id]]);
    const d = await call(caseDecidePOST as H, 'POST', {
      headers: admin,
      params: { type: 'event', id },
      body: { decision: 'remove', reason: 'Not real' },
    });
    expect(d.status).toBe(200);
    expect((await detail(me.token, id)).status).toBe(404);
    void adminId;
  });
});

describe('event chat (P18.7)', () => {
  /** An event on now: started 30 minutes ago, ends in 2 hours, 150 m around downtown. */
  async function onNow(over: Record<string, unknown> = {}) {
    const start = new Date(Date.now() - 30 * 60_000);
    const end = new Date(Date.now() + 120 * 60_000);
    return addEvent({
      ...DOWNTOWN,
      sessions: [{ date: localDate(start), start: localTime(start), end: localTime(end) }],
      ...over,
    });
  }
  const at = (fn: H, token: string, id: string, where = DOWNTOWN, extra = {}) =>
    call(fn, 'POST', { token, id, body: { reading: reading(where), ...extra } });

  it('asks people at the event, lets them in, and shows their lines', async () => {
    const id = await onNow();
    expect((await at(chatStatusPOST as H, me.token, id)).body.state).toBe('ask');
    expect((await at(chatJoinPOST as H, me.token, id)).status).toBe(200);
    expect((await at(chatStatusPOST as H, me.token, id)).body.state).toBe('joined');
    const sent = await at(chatSendPOST as H, me.token, id, DOWNTOWN, {
      body: 'Which porch has the jazz trio?',
    });
    expect(sent.status).toBe(201);
    const list = await at(chatListPOST as H, me.token, id);
    expect(list.body.lines.map((l: { body: string }) => l.body)).toEqual([
      'Which porch has the jazz trio?',
    ]);
    expect(findForbiddenKeys(list.body)).toEqual([]);
  });

  it('🔒 people away from the event, or who haven’t joined, can’t read or send', async () => {
    const id = await onNow();
    expect((await at(chatStatusPOST as H, other.token, id, RIVERSIDE)).body.state).toBe('away');
    expect((await at(chatJoinPOST as H, other.token, id, RIVERSIDE)).body.error.code).toBe(
      'NOT_AT_EVENT',
    );
    expect((await at(chatListPOST as H, other.token, id)).body.error.code).toBe('NOT_JOINED');
    const send = await at(chatSendPOST as H, other.token, id, DOWNTOWN, { body: 'hello' });
    expect(send.body.error.code).toBe('NOT_JOINED');
    // Joined, then walked away: refused again.
    await at(chatJoinPOST as H, me.token, id);
    expect((await at(chatListPOST as H, me.token, id, RIVERSIDE)).body.error.code).toBe(
      'NOT_AT_EVENT',
    );
    expect(await db.eventChatMessage.count()).toBe(0);
  });

  it('🔒 is closed before it opens and for cancelled events', async () => {
    const later = await addEvent({ ...DOWNTOWN });
    expect((await at(chatStatusPOST as H, me.token, later)).body.state).toBe('closed');
    expect((await at(chatJoinPOST as H, me.token, later)).body.error.code).toBe('CHAT_CLOSED');
    const now = await onNow({ title: 'Called off' });
    await decide(now, { action: 'cancel', reason: 'Storm' });
    expect((await at(chatJoinPOST as H, me.token, now)).status).toBe(404);
  });

  it('refuses alarming phrases with a 911 message, without counting it against you', async () => {
    const id = await onNow();
    await at(chatJoinPOST as H, me.token, id);
    const r = await at(chatSendPOST as H, me.token, id, DOWNTOWN, {
      body: 'Shots fired near the stage!',
    });
    expect(r.body.error.code).toBe('EVENT_CHAT_ALARM');
    expect(r.body.error.message).toContain('911');
    expect(await db.chatOffense.count({ where: { userId: me.id } })).toBe(0);
  });

  it('pins organizer updates, reports copy the person’s lines, and the purge clears answers', async () => {
    const id = await onNow();
    await at(chatJoinPOST as H, me.token, id);
    await at(chatJoinPOST as H, other.token, id);
    await at(chatSendPOST as H, other.token, id, DOWNTOWN, { body: 'rude line here' });
    const session = await db.eventSession.findFirstOrThrow({ where: { eventId: id } });
    const biz = await db.businessAccount.create({
      data: { email: 'org@example.test', passwordHash: 'x' },
    });
    await db.eventChatMessage.create({
      data: {
        sessionId: session.id,
        businessAccountId: biz.id,
        body: 'Main stage starts at 3',
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });
    const list = await at(chatListPOST as H, me.token, id);
    expect(list.body.updates.map((u: { body: string }) => u.body)).toEqual([
      'Main stage starts at 3',
    ]);
    expect(list.body.lines).toHaveLength(1);
    const rep = await call(reportPOST as H, 'POST', {
      token: me.token,
      body: {
        reading: reading(),
        target: { type: 'eventChat', eventId: id, username: 'other_user' },
        reason: 'HARASSMENT',
      },
    });
    expect(rep.status).toBe(202);
    const saved = await db.report.findFirstOrThrow({ where: { reportedUserId: other.id } });
    expect(JSON.stringify(saved.chatEvidence)).toContain('rude line here');
    // Counted for Insights before the purge, then a day after the session the answers go.
    await countEventDays();
    const stats = await db.eventDailyStats.findFirstOrThrow({ where: { eventId: id } });
    expect(stats).toMatchObject({ attendees: 2, chatLines: 1 });
    expect(
      (await purgeEventChat(new Date(session.endsAt.getTime() + 25 * 3_600_000))).attendance,
    ).toBe(2);
  });
});

describe('events as ads (P18.8)', () => {
  it('an organizer’s ad promotes an event with no place, and stops when it’s cancelled', async () => {
    await ensureTiers(db);
    const id = await addEvent({ hostKind: 'organizer', ...DOWNTOWN });
    const org = await db.businessAccount.create({
      data: { email: 'fest@example.test', passwordHash: 'x' },
    });
    const plan = await db.plan.findUniqueOrThrow({ where: { code: 'PREMIUM' } });
    await db.subscription.create({
      data: { accountId: org.id, planId: plan.id, startsAt: new Date(Date.now() - DAY) },
    });
    await db.ad.create({
      data: {
        accountId: org.id,
        eventId: id,
        template: 'BANNER',
        headline: 'PorchFest this Saturday',
        status: 'APPROVED',
        cityWide: true,
        approvedAt: new Date(),
      },
    });
    resetAdCache();
    const ask = () =>
      call(adsPOST as H, 'POST', {
        token: me.token,
        body: { reading: reading(), context: { kind: 'feed' }, count: 3 },
      });
    const r = await ask();
    expect(r.status).toBe(200);
    expect(r.body.ads).toHaveLength(1);
    expect(r.body.ads[0].place).toBeNull();
    expect(r.body.ads[0].event).toMatchObject({
      id,
      title: 'Riverside PorchFest',
      date: inDays(3),
      startTime: '12:00',
    });
    await decide(id, { action: 'cancel', reason: 'Storm' });
    resetAdCache();
    expect((await ask()).body.ads).toHaveLength(0);
  });

  it('🔒 an ad must promote a place or an event (database rule)', async () => {
    const org = await db.businessAccount.create({
      data: { email: 'x@example.test', passwordHash: 'x' },
    });
    await expect(
      db.ad.create({
        data: { accountId: org.id, template: 'BANNER', headline: 'Nothing', status: 'DRAFT' },
      }),
    ).rejects.toThrow();
  });
});

describe('event organizers (P18.9)', () => {
  it('an organizer is named at once (D237); ticking it as checked is quiet', async () => {
    const acct = await db.businessAccount.create({
      data: { email: 'fest@example.test', passwordHash: 'x' },
    });
    await db.eventOrganizer.create({
      data: { accountId: acct.id, name: 'Riverside Avondale Preservation', contactName: 'Pat' },
    });
    const id = await addEvent({ hostKind: 'organizer' });
    await db.event.update({ where: { id }, data: { businessAccountId: acct.id } });
    // Named while nobody has checked it yet.
    expect((await detail(me.token, id)).body.event.host).toMatchObject({
      kind: 'organizer',
      name: 'Riverside Avondale Preservation',
    });
    const decideOrg = (body: Record<string, unknown>) =>
      call(organizerPOST as H, 'POST', { headers: admin, id: acct.id, body });
    expect((await decideOrg({ action: 'approve' })).status).toBe(200);
    expect(await db.businessNotice.count({ where: { accountId: acct.id } })).toBe(0);
    // Ticking twice isn't a thing.
    expect((await decideOrg({ action: 'approve' })).status).toBe(409);
  });

  // 🔒 D237: closing (from new or checked) needs a note, tells them, and hides their name.
  it('closing an organizer, new or checked, hides its name; reopening brings it back', async () => {
    const acct = await db.businessAccount.create({
      data: { email: 'fest@example.test', passwordHash: 'x' },
    });
    await db.eventOrganizer.create({
      data: { accountId: acct.id, name: 'Jax Pop-Ups', contactName: 'Pat', status: 'VERIFIED' },
    });
    const id = await addEvent({ hostKind: 'organizer' });
    await db.event.update({ where: { id }, data: { businessAccountId: acct.id } });
    const decideOrg = (body: Record<string, unknown>) =>
      call(organizerPOST as H, 'POST', { headers: admin, id: acct.id, body });
    expect((await decideOrg({ action: 'reject', note: '' })).status).toBe(400);
    expect((await decideOrg({ action: 'revoke', note: 'Old action' })).status).toBe(400);
    expect((await decideOrg({ action: 'reject', note: 'Not a real organizer' })).status).toBe(200);
    expect(
      await db.eventOrganizer.findUniqueOrThrow({ where: { accountId: acct.id } }),
    ).toMatchObject({ status: 'REJECTED', decisionNote: 'Not a real organizer' });
    expect((await detail(me.token, id)).body.event.host.name).toBeNull();
    expect(
      await db.businessNotice.findFirstOrThrow({ where: { accountId: acct.id } }),
    ).toMatchObject({ kind: 'ORGANIZER_REJECTED', body: 'Not a real organizer' });
    expect((await decideOrg({ action: 'approve' })).status).toBe(200);
    expect((await detail(me.token, id)).body.event.host.name).toBe('Jax Pop-Ups');
  });

  it('a business is told when its event is approved or denied', async () => {
    const acct = await db.businessAccount.create({
      data: { email: 'bar@example.test', passwordHash: 'x' },
    });
    const id = await addEvent();
    await db.event.update({
      where: { id },
      data: { status: 'IN_REVIEW', businessAccountId: acct.id },
    });
    await decide(id, { action: 'deny', reason: 'Add the real start time' });
    const n = await db.businessNotice.findFirstOrThrow({ where: { accountId: acct.id } });
    expect(n.kind).toBe('EVENT_DENIED');
    expect(n.body).toBe('Add the real start time');
  });

  it('approving a website event names its neighborhood and ZIP, and refuses a pin outside Duval', async () => {
    const acct = await db.businessAccount.create({
      data: { email: 'org2@example.test', passwordHash: 'x' },
    });
    const id = await addEvent();
    await db.event.update({
      where: { id },
      data: { status: 'IN_REVIEW', businessAccountId: acct.id, neighborhood: null, zip: null },
    });
    expect((await decide(id, { action: 'approve' })).status).toBe(200);
    const e = await db.event.findUniqueOrThrow({ where: { id } });
    expect(e.neighborhood).toBeTruthy();
    expect(e.zip).toMatch(/^322\d\d$/);
    const far = await addEvent({ title: 'Far away' });
    await db.event.update({ where: { id: far }, data: { status: 'IN_REVIEW', ...ST_AUGUSTINE } });
    expect((await decide(far, { action: 'approve' })).body.error.code).toBe('OUTSIDE_SERVICE_AREA');
  });
});

describe('coming up (D241)', () => {
  const comingUp = (token: string, at = DOWNTOWN) =>
    call(comingUpPOST as H, 'POST', { token, body: { reading: reading(at) } });

  it('lists followed events today and tomorrow, and the badge counts today’s', async () => {
    const soon = new Date(Date.now() + 30 * 60_000);
    const later = new Date(soon.getTime() + 90 * 60_000);
    const today = await addEvent({
      title: 'Tonight',
      sessions: [{ date: localDate(soon), start: localTime(soon), end: localTime(later) }],
    });
    const tomorrow = await addEvent({
      title: 'Tomorrow',
      sessions: [{ date: inDays(1), start: '19:00', end: '21:00' }],
    });
    const nextWeek = await addEvent({ title: 'Next week' });
    const notFollowed = await addEvent({
      title: 'Not followed',
      sessions: [{ date: inDays(1), start: '10:00', end: '11:00' }],
    });
    for (const id of [today, tomorrow, nextWeek]) {
      await call(followPUT as H, 'PUT', { token: me.token, id });
    }
    const r = await comingUp(me.token);
    expect(r.status).toBe(200);
    const titles = r.body.events.map((e: { title: string }) => e.title);
    // "Tonight" may fall on tomorrow's date near midnight; either way both are listed.
    expect(titles.sort()).toEqual(['Tomorrow', 'Tonight']);
    expect(titles).not.toContain('Next week');
    void notFollowed;
    const badges = await call(badgesGET as H, 'GET', { token: me.token });
    expect(badges.body.eventsToday).toBe(localDate(soon) === localDate(new Date()) ? 1 : 0);
    // Someone who follows nothing: empty, and no dot.
    expect((await comingUp(other.token)).body.events).toEqual([]);
    expect((await call(badgesGET as H, 'GET', { token: other.token })).body.eventsToday).toBe(0);
  });

  it('🔒 accounts only, and only from inside Duval', async () => {
    const inst = (await call(installPOST as H, 'POST', { body: {} })).body.installationToken;
    const g = await call(guestsPOST as H, 'POST', {
      body: {},
      headers: { [INSTALLATION_HEADER]: inst },
    });
    expect((await comingUp(g.body.token)).status).not.toBe(200);
    expect((await comingUp(me.token, ST_AUGUSTINE)).status).toBe(403);
  });
});
