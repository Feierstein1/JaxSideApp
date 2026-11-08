import { beforeEach, describe, expect, it } from 'vitest';
import { POST as roomPOST } from '@/app/api/v1/admin/chat/rooms/[id]/route';
import { POST as listPOST } from '@/app/api/v1/chat/messages/list/route';
import { POST as sendPOST } from '@/app/api/v1/chat/messages/route';
import { POST as statusPOST } from '@/app/api/v1/chat/status/route';
import { createSession } from '@/server/auth/sessions';
import { purgeChat, sendChat, trimRoom } from '@/server/chat/chat';
import { notePresence } from '@/server/chat/presence';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { invalidateScreeningCache } from '@/server/moderation/screening';
import { importZipAreas } from '@/server/stats/zip-areas';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestGuest, createTestUser } from './user-factory';

// D218 / P17.3, P17.4, P17.6, P17.7: area chat rooms, sending, reading, limits and purging.

const HERE = { latitude: 30.3149, longitude: -81.6853 }; // Five Points
const FAR = { latitude: HERE.latitude + 0.05, longitude: HERE.longitude }; // another cell, still Duval
const OUTSIDE = { latitude: 33.749, longitude: -84.388 }; // Atlanta
const reading = (p = HERE) => ({ ...p, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

type Person = { id: string; token: string };
let alice: Person;
let bob: Person;
let cara: Person; // email not confirmed
let admin: Person;
let roomId: string;

async function person(name: string, extra: object = {}): Promise<Person> {
  const u = await createTestUser(name, { emailVerifiedAt: new Date(), ...extra });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
}

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  // Tests send quickly; the limits themselves are tested below with their own settings.
  await db.appConfiguration.createMany({
    data: [{ key: 'rateLimit.chat.burstPer3s', value: 1000 }],
    skipDuplicates: true,
  });
  invalidateConfigCache();
  invalidateScreeningCache();
  await importServiceArea(db, readBoundaryFile());
  await importZipAreas(db);
  alice = await person('alice_ch');
  bob = await person('bob_ch');
  admin = await person('staff_ch', { role: 'ADMIN' });
  const u = await createTestUser('cara_ch');
  cara = { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
  // Two people about in the Five Points cell, and an admin has switched its chat on.
  const room = await notePresence(alice.id, HERE);
  await notePresence(bob.id, HERE);
  await db.chatRoom.update({ where: { id: room.id }, data: { enabled: true } });
  roomId = room.id;
});

const send = (p: Person, body: string, at = HERE) =>
  call(sendPOST as H, 'POST', { token: p.token, body: { reading: reading(at), body } });
const list = (p: Person, extra: object = {}, at = HERE) =>
  call(listPOST as H, 'POST', { token: p.token, body: { reading: reading(at), ...extra } });
const status = (p: Person, at = HERE) =>
  call(statusPOST as H, 'POST', { token: p.token, body: { reading: reading(at) } });

describe('who gets chat', () => {
  // 🔒 Confirmed accounts only; guests and signed-out callers get nothing.
  it('refuses signed-out callers, guests and unconfirmed accounts', async () => {
    expect((await call(statusPOST as H, 'POST', { body: { reading: reading() } })).status).toBe(
      401,
    );
    const guest = await createTestGuest();
    expect(
      (
        await call(sendPOST as H, 'POST', {
          token: guest.tokenHash,
          body: { reading: reading(), body: 'hi' },
        })
      ).status,
    ).toBe(401);
    expect((await send(cara, 'hi')).status).toBe(403);
    expect((await list(cara)).status).toBe(403);
    expect((await status(cara)).status).toBe(403);
    expect(await db.chatMessage.count()).toBe(0);
  });

  it('is closed while the room is switched off, or fewer than 2 people are about', async () => {
    await db.chatRoom.update({ where: { id: roomId }, data: { enabled: false } });
    expect((await status(alice)).body).toEqual({ open: false, room: null, people: null });
    expect((await send(alice, 'hi')).body.error.code).toBe('CHAT_CLOSED');
    expect((await list(alice)).body.error.code).toBe('CHAT_CLOSED');
    await db.chatRoom.update({ where: { id: roomId }, data: { enabled: true } });
    await db.chatPresence.delete({ where: { userId: bob.id } });
    expect((await status(alice)).body.open).toBe(false); // only one person about
    await notePresence(bob.id, HERE);
    const open = (await status(alice)).body;
    expect(open.open).toBe(true);
    expect(open.people).toBe('a few');
    expect(open.room.zip).toBe('32204');
  });

  it('shows the exact number of people from 5', async () => {
    for (const n of ['c1', 'c2', 'c3']) {
      const p = await person(`${n}_ch`);
      await notePresence(p.id, HERE);
    }
    expect((await status(alice)).body.people).toBe('5');
  });
});

describe('sending and reading', () => {
  it('a line shows to the room with a username only: no picture, email, ID or place', async () => {
    const sent = await send(alice, '  hello neighbors  ');
    expect(sent.status).toBe(201);
    const r = await list(bob);
    expect(r.status).toBe(200);
    expect(r.body.lines).toHaveLength(1);
    expect(Object.keys(r.body.lines[0]).sort()).toEqual([
      'admin',
      'body',
      'createdAt',
      'id',
      'username',
    ]);
    expect(r.body.lines[0]).toMatchObject({
      username: 'alice_ch',
      admin: false,
      body: 'hello neighbors',
    });
    expect(r.raw).not.toContain(alice.id);
    expect(r.raw).not.toMatch(/example\.test/);
    expect(r.raw).not.toContain('30.31');
  });

  it('staff lines are marked so the app can show them in the admin color', async () => {
    await notePresence(admin.id, HERE);
    await send(admin, 'Welcome to the chat');
    expect((await list(alice)).body.lines[0].admin).toBe(true);
  });

  it('asking for lines after a time returns only the newer ones', async () => {
    await send(alice, 'first line');
    const first = (await list(bob)).body.lines[0];
    await send(bob, 'second line');
    const later = (await list(alice, { after: first.createdAt })).body.lines;
    expect(later.map((l: { body: string }) => l.body)).toEqual(['second line']);
  });

  it('a line is 1 to 200 characters of plain text', async () => {
    expect((await send(alice, '')).status).toBe(400);
    expect((await send(alice, 'x'.repeat(201))).status).toBe(400);
    expect((await send(alice, 'x'.repeat(200))).status).toBe(201);
    expect((await send(bob, 'bad\u0007bell')).status).toBe(400);
  });

  it('refuses links and forbidden words, and saying the same thing twice', async () => {
    await db.screeningRule.create({
      data: { term: 'i will hurt you', action: 'BLOCK', match: 'WORD', category: 'THREAT' },
    });
    invalidateScreeningCache();
    expect((await send(alice, 'I will hurt you')).body.error.code).toBe('CONTENT_BLOCKED');
    expect((await send(alice, 'see https://spam.example now')).body.error.code).toBe('NO_LINKS');
    expect((await send(alice, 'see spam.com/win')).status).toBe(422);
    expect((await send(alice, 'Anyone around?')).status).toBe(201);
    expect((await send(alice, 'anyone   around')).body.error.code).toBe('DUPLICATE_MESSAGE');
    expect(await db.chatMessage.count()).toBe(1);
  });

  it('lines by suspended people are not shown', async () => {
    await send(alice, 'hello');
    await db.user.update({ where: { id: alice.id }, data: { status: 'SUSPENDED' } });
    expect((await list(bob)).body.lines).toEqual([]);
  });
});

describe('spam limits', () => {
  it('one line per 3 seconds, 10 a minute and 100 an hour', async () => {
    await db.appConfiguration.update({
      where: { key: 'rateLimit.chat.burstPer3s' },
      data: { value: 1 },
    });
    invalidateConfigCache();
    expect((await send(alice, 'one')).status).toBe(201);
    const fast = await send(alice, 'two');
    expect(fast.status).toBe(429);
    expect(fast.body.error.code).toBe('RATE_LIMITED');

    await db.appConfiguration.update({
      where: { key: 'rateLimit.chat.burstPer3s' },
      data: { value: 1000 },
    });
    invalidateConfigCache();
    const codes: number[] = [];
    for (let i = 0; i < 11; i++) codes.push((await send(bob, `line number ${i}`)).status);
    expect(codes.slice(0, 10).every((c) => c === 201)).toBe(true);
    expect(codes[10]).toBe(429);
  });

  it('the hourly cap applies even when the minute cap is not reached', async () => {
    await db.appConfiguration.createMany({
      data: [
        { key: 'rateLimit.chat.perMinute', value: 1000 },
        { key: 'rateLimit.chat.perHour', value: 3 },
      ],
      skipDuplicates: true,
    });
    invalidateConfigCache();
    const codes: number[] = [];
    for (let i = 0; i < 4; i++) codes.push((await send(alice, `different thing ${i}`)).status);
    expect(codes).toEqual([201, 201, 201, 429]);
  });
});

describe('the room comes from where you are', () => {
  // 🔒 The client can't pick a room: a reading from another cell puts you in that cell's room.
  it('cannot post into a room you are not standing in', async () => {
    const r = await send(alice, 'sneaky', FAR);
    expect(r.status).toBe(403); // the far cell's room exists but is switched off
    expect(r.body.error.code).toBe('CHAT_CLOSED');
    expect(await db.chatMessage.count()).toBe(0);
    expect(await db.chatRoom.count()).toBe(2);
  });

  it('needs a location inside Duval', async () => {
    expect((await send(alice, 'hi', OUTSIDE)).status).toBeGreaterThanOrEqual(400);
    expect(await db.chatMessage.count()).toBe(0);
  });
});

describe('keeping lines (D218)', () => {
  const at = (minutesAgo: number) => new Date(Date.now() - minutesAgo * 60_000);

  async function fill(count: number, spreadMinutes: number) {
    for (let i = 0; i < count; i++) {
      await db.chatMessage.create({
        data: {
          roomId,
          authorId: alice.id,
          body: `line ${i}`,
          createdAt: at(((count - i) * spreadMinutes) / count),
          expiresAt: new Date(Date.now() + 23 * 3_600_000),
        },
      });
    }
  }

  it('a quiet room keeps its newest 40', async () => {
    await fill(60, 600); // spread over 10 hours
    await trimRoom(roomId);
    const kept = await db.chatMessage.findMany({ orderBy: { createdAt: 'asc' } });
    expect(kept).toHaveLength(40);
    expect(kept[39]!.body).toBe('line 59');
  });

  it('a busy room keeps up to 150 lines while they are under 30 minutes old', async () => {
    await fill(200, 20); // 200 lines in 20 minutes
    await trimRoom(roomId);
    expect(await db.chatMessage.count()).toBe(150);
  });

  it('sending trims the room', async () => {
    await fill(45, 600);
    await sendChat(await db.user.findUniqueOrThrow({ where: { id: bob.id } }), {
      reading: reading(),
      body: 'new line',
    });
    expect(await db.chatMessage.count()).toBe(40);
  });

  it('lines expire after 23 hours (not shown) and are deleted at 24; idle rooms after 7 days', async () => {
    await db.chatMessage.create({
      data: {
        roomId,
        authorId: alice.id,
        body: 'old',
        createdAt: at(23 * 60 + 30),
        expiresAt: at(30),
      },
    });
    expect((await list(bob)).body.lines).toEqual([]);
    expect(await db.chatMessage.count()).toBe(1);
    const now = new Date();
    expect((await purgeChat(now)).lines).toBe(0); // expired 30 minutes ago: kept until an hour
    expect((await purgeChat(new Date(now.getTime() + 40 * 60_000))).lines).toBe(1);

    const idle = new Date(now.getTime() + 8 * 86_400_000);
    await db.chatPresence.deleteMany({});
    expect((await purgeChat(idle)).rooms).toBe(1);
    expect(await db.chatRoom.count()).toBe(0);
  });

  it('a room with people present is not deleted for being idle', async () => {
    const idle = new Date(Date.now() + 8 * 86_400_000);
    expect((await purgeChat(idle)).rooms).toBe(0);
  });
});

describe('admin: switch a room on or off', () => {
  async function adminPost(body: object, id = roomId, as = admin.id) {
    return call(roomPOST as H, 'POST', { id, body, headers: await adminHeaders(as) });
  }

  it('enables, disables and renames, with an audit entry each time', async () => {
    expect((await adminPost({ action: 'disable', reason: 'testing off' })).status).toBe(200);
    expect((await db.chatRoom.findUniqueOrThrow({ where: { id: roomId } })).enabled).toBe(false);
    expect((await adminPost({ action: 'enable', reason: 'testing on' })).status).toBe(200);
    expect(
      (await adminPost({ action: 'rename', reason: 'friendly name', displayName: 'Five Points' }))
        .status,
    ).toBe(200);
    expect((await status(alice)).body.room.title).toBe('Five Points');
    await adminPost({ action: 'rename', reason: 'clear it', displayName: '' });
    expect((await db.chatRoom.findUniqueOrThrow({ where: { id: roomId } })).displayName).toBeNull();
    expect(await db.adminAuditLog.count({ where: { action: { startsWith: 'CHAT_ROOM_' } } })).toBe(
      4,
    );
  });

  // 🔒 Only admins.
  it('refuses regular users and a missing room', async () => {
    expect(
      (
        await call(roomPOST as H, 'POST', {
          token: alice.token,
          id: roomId,
          body: { action: 'disable', reason: 'nope' },
        })
      ).status,
    ).toBeGreaterThanOrEqual(401);
    expect((await db.chatRoom.findUniqueOrThrow({ where: { id: roomId } })).enabled).toBe(true);
    expect(
      (
        await adminPost(
          { action: 'enable', reason: 'no such room' },
          '00000000-0000-4000-8000-000000000000',
        )
      ).status,
    ).toBe(404);
  });
});
