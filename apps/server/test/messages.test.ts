import sharp from 'sharp';
import { beforeEach, describe, expect, it } from 'vitest';
import { POST as hideChatPOST } from '@/app/api/v1/messages/conversations/[id]/hide/route';
import { POST as hidePOST } from '@/app/api/v1/messages/[id]/hide/route';
import { POST as unsendPOST } from '@/app/api/v1/messages/[id]/unsend/route';
import { GET as listGET, POST as sendPOST } from '@/app/api/v1/messages/route';
import { GET as unreadGET } from '@/app/api/v1/messages/unread/route';
import { GET as withGET } from '@/app/api/v1/messages/with/[username]/route';
import { POST as photosPOST } from '@/app/api/v1/photos/route';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { POST as reportPOST } from '@/app/api/v1/reports/route';
import { decideCase, getCase } from '@/server/admin/queue';
import { deleteAccount } from '@/server/auth/account';
import { hashPassword } from '@/server/auth/crypto';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { MemoryStore, setObjectStore } from '@/server/media/store';
import { invalidateScreeningCache } from '@/server/moderation/screening';
import { pair } from '@/server/social/friends';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D98: private messages between mutual friends.

const HERE = { latitude: 30.3149, longitude: -81.6853 };
const OUTSIDE = { latitude: 30.1661, longitude: -81.7065 }; // Orange Park
const reading = (p = HERE) => ({ ...p, accuracyMeters: 10, timestamp: Date.now() - 2_000 });
const DAY = 86_400_000;

type P = { id: string; token: string; name: string };
let ann: P;
let bob: P;
let cat: P;

async function person(name: string, ageDays = 10): Promise<P> {
  const u = await createTestUser(name, {
    emailVerifiedAt: new Date(),
    createdAt: new Date(Date.now() - ageDays * DAY),
    passwordHash: await hashPassword('correct horse battery'),
  });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token, name };
}
const befriend = (a: P, b: P) =>
  db.friendship.create({ data: { ...pair(a.id, b.id), requesterId: a.id, status: 'ACCEPTED' } });

const send = (from: P, to: string, body: string, extra: Record<string, unknown> = {}) =>
  call(sendPOST as H, 'POST', {
    token: from.token,
    body: { reading: reading(), to, body, ...extra },
  });
const chat = async (me: P, other: string) =>
  (await call(withGET as H, 'GET', { token: me.token, params: { username: other } })).body;
const unread = async (me: P) =>
  (await call(unreadGET as H, 'GET', { token: me.token })).body.unread as number;

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  invalidateConfigCache();
  invalidateScreeningCache();
  setObjectStore(new MemoryStore());
  await importServiceArea(db, readBoundaryFile());
  ann = await person('ann_m');
  bob = await person('bob_m');
  cat = await person('cat_m');
  await befriend(ann, bob);
});

describe('messaging friends (D98)', () => {
  it('friends chat; the other side sees it as unread until they open it', async () => {
    expect((await send(ann, 'bob_m', 'Hey Bob!')).status).toBe(201);
    expect(await unread(bob)).toBe(1);
    const list = (await call(listGET as H, 'GET', { token: bob.token })).body.conversations;
    expect(list[0]).toMatchObject({
      with: { username: 'ann_m' },
      preview: 'Hey Bob!',
      unread: true,
    });
    const c = await chat(bob, 'ann_m');
    expect(c.messages).toEqual([expect.objectContaining({ body: 'Hey Bob!', mine: false })]);
    expect(c.canSend).toBe(true);
    expect(await unread(bob)).toBe(0); // opening it read it
    await send(bob, 'ann_m', 'Hi Ann');
    const mine = await chat(ann, 'bob_m');
    expect(mine.messages.map((m: { body: string; mine: boolean }) => [m.body, m.mine])).toEqual([
      ['Hey Bob!', true],
      ['Hi Ann', false],
    ]);
  });

  // 🔒 Mutual friends only; blocks stop it.
  it('strangers, blocked people and ex-friends can’t send', async () => {
    expect((await send(ann, 'cat_m', 'hello?')).body.error.code).toBe('NOT_FRIENDS');
    await send(ann, 'bob_m', 'before the block');
    await db.userBlock.create({ data: { blockerId: bob.id, blockedId: ann.id } });
    expect((await send(ann, 'bob_m', 'still there?')).body.error.code).toBe('NOT_FRIENDS');
    await db.userBlock.deleteMany();
    await db.friendship.deleteMany();
    expect((await send(ann, 'bob_m', 'unfriended')).status).toBe(403);
    // The old chat stays readable, but you can't send.
    const c = await chat(ann, 'bob_m');
    expect(c.messages).toHaveLength(1);
    expect(c.canSend).toBe(false);
  });

  // 🔒 You can only see and touch chats you're in.
  it('someone outside the chat can’t read, unsend, hide or report its messages', async () => {
    const m = (await send(ann, 'bob_m', 'private')).body.message;
    expect((await chat(cat, 'ann_m')).messages).toEqual([]); // cat has no chat with ann
    const conv = await db.conversation.findFirstOrThrow();
    for (const [h, id] of [
      [unsendPOST, m.id],
      [hidePOST, m.id],
      [hideChatPOST, conv.id],
    ] as const) {
      expect((await call(h as H, 'POST', { token: cat.token, id, body: {} })).status).toBe(404);
    }
    const r = await call(reportPOST as H, 'POST', {
      token: cat.token,
      body: { reading: reading(), target: { type: 'message', id: m.id }, reason: 'HARASSMENT' },
    });
    expect(r.status).toBe(404);
    // Bob (in the chat) can't unsend Ann's message either.
    expect(
      (await call(unsendPOST as H, 'POST', { token: bob.token, id: m.id, body: {} })).status,
    ).toBe(404);
  });

  it('texts are encrypted at rest', async () => {
    await send(ann, 'bob_m', 'meet at the secret spot');
    const raw = await db.$queryRaw<{ dump: string }[]>`
      SELECT encode("bodyEnc", 'escape') AS dump FROM "Message"`;
    expect(raw[0]!.dump).not.toContain('secret spot');
  });

  it('unsend within 15 minutes (gone for both); after that only “delete for me”', async () => {
    const m = (await send(ann, 'bob_m', 'oops')).body.message;
    expect(m.canUnsend).toBe(true);
    expect(
      (await call(unsendPOST as H, 'POST', { token: ann.token, id: m.id, body: {} })).status,
    ).toBe(200);
    expect((await chat(bob, 'ann_m')).messages).toEqual([]);
    const old = (await send(ann, 'bob_m', 'too late')).body.message;
    await db.message.update({
      where: { id: old.id },
      data: { createdAt: new Date(Date.now() - 16 * 60_000) },
    });
    const late = await call(unsendPOST as H, 'POST', { token: ann.token, id: old.id, body: {} });
    expect(late.body.error.code).toBe('TOO_LATE');
  });

  it('delete for me: one message, or the whole chat until something new arrives', async () => {
    const m = (await send(ann, 'bob_m', 'one')).body.message;
    await send(ann, 'bob_m', 'two');
    await call(hidePOST as H, 'POST', { token: bob.token, id: m.id, body: {} });
    expect((await chat(bob, 'ann_m')).messages.map((x: { body: string }) => x.body)).toEqual([
      'two',
    ]);
    expect((await chat(ann, 'bob_m')).messages).toHaveLength(2); // only hidden for Bob
    const conv = await db.conversation.findFirstOrThrow();
    await call(hideChatPOST as H, 'POST', { token: bob.token, id: conv.id, body: {} });
    expect((await call(listGET as H, 'GET', { token: bob.token })).body.conversations).toEqual([]);
    await new Promise((r) => setTimeout(r, 5));
    await send(ann, 'bob_m', 'three');
    expect((await chat(bob, 'ann_m')).messages.map((x: { body: string }) => x.body)).toEqual([
      'three',
    ]);
  });

  it('screened like posts but never held: refused; new accounts only reply and send no links', async () => {
    await db.screeningRule.create({
      data: { term: 'i will hurt you', action: 'BLOCK', match: 'WORD', category: 'THREAT' },
    });
    invalidateScreeningCache();
    const r = await send(ann, 'bob_m', 'I will hurt you');
    expect(r.body.error.code).toBe('CONTENT_BLOCKED');
    expect(await db.message.count()).toBe(0);
    const newbie = await person('new_m', 0.5); // 12 hours old
    await befriend(newbie, ann);
    expect((await send(newbie, 'ann_m', 'hi!')).body.error.code).toBe('ACCOUNT_TOO_NEW');
    await send(ann, 'new_m', 'welcome');
    expect((await send(newbie, 'ann_m', 'thanks!')).status).toBe(201); // replying is fine
    expect((await send(newbie, 'ann_m', 'see https://spam.example')).body.error.code).toBe(
      'LINKS_NOT_YET',
    );
  });

  it('needs to be sent from inside Duval', async () => {
    const r = await call(sendPOST as H, 'POST', {
      token: ann.token,
      body: { reading: reading(OUTSIDE), to: 'bob_m', body: 'hi' },
    });
    expect(r.body.error.code).toBe('LOCATION_OUTSIDE_AREA');
  });

  it('photos: sent in a message, seen by the friend, and can’t be reused on a post', async () => {
    const jpeg = await sharp({
      create: { width: 400, height: 300, channels: 3, background: { r: 10, g: 120, b: 140 } },
    })
      .jpeg()
      .toBuffer();
    const up = await (photosPOST as H)(
      new Request('http://localhost/x', {
        method: 'POST',
        headers: { 'content-type': 'image/jpeg', authorization: `Bearer ${ann.token}` },
        body: new Uint8Array(jpeg),
      }),
      undefined as never,
    );
    const photoId = (await up.json()).id as string;
    expect((await send(ann, 'bob_m', '', { photoIds: [photoId] })).status).toBe(201);
    const c = await chat(bob, 'ann_m');
    expect(c.messages[0].photos[0].id).toBe(photoId);
    const p = await call(postsPOST as H, 'POST', {
      token: ann.token,
      body: { reading: reading(), body: 'reuse it', photoIds: [photoId] },
    });
    expect(p.body.error.code).toBe('INVALID_PHOTO');
  });
});

describe('reporting a message (D98)', () => {
  it('the report keeps the message and the 10 around it; removing it unsends it', async () => {
    for (let i = 0; i < 6; i++) await send(ann, 'bob_m', `before ${i}`);
    const bad = (await send(ann, 'bob_m', 'the nasty one')).body.message;
    for (let i = 0; i < 6; i++) await send(bob, 'ann_m', `after ${i}`);
    const r = await call(reportPOST as H, 'POST', {
      token: bob.token,
      body: { reading: reading(), target: { type: 'message', id: bad.id }, reason: 'HARASSMENT' },
    });
    expect(r.status).toBe(202);
    const c = await getCase({ type: 'message', id: bad.id });
    expect(c.messageContext).toHaveLength(11);
    expect(c.messageContext!.find((m) => m.reported)).toMatchObject({
      body: 'the nasty one',
      sender: 'ann_m',
    });
    expect(c.author).toMatchObject({ username: 'ann_m' });
    const admin = await createTestUser('mod_m', { role: 'ADMIN' });
    await decideCase({
      adminId: admin.id,
      ref: { type: 'message', id: bad.id },
      decision: 'remove',
      reason: 'Harassment',
    });
    expect((await chat(bob, 'ann_m')).messages.map((m: { body: string }) => m.body)).not.toContain(
      'the nasty one',
    );
    // You can't report your own message.
    const own = await call(reportPOST as H, 'POST', {
      token: ann.token,
      body: { reading: reading(), target: { type: 'message', id: bad.id }, reason: 'SPAM' },
    });
    expect(own.status).toBeGreaterThanOrEqual(400);
  });

  it('deleting an account deletes its messages; the report keeps its snapshot', async () => {
    const m = (await send(ann, 'bob_m', 'evidence')).body.message;
    await call(reportPOST as H, 'POST', {
      token: bob.token,
      body: { reading: reading(), target: { type: 'message', id: m.id }, reason: 'SPAM' },
    });
    await deleteAccount(
      (await db.user.findUniqueOrThrow({ where: { id: ann.id } })) as never,
      'correct horse battery',
    );
    expect(await db.message.count({ where: { senderId: ann.id } })).toBe(0);
    const report = await db.report.findFirstOrThrow();
    expect(report.messageId).toBeNull();
    expect(JSON.stringify(report.messageEvidence)).toContain('evidence');
    expect((await getCase({ type: 'message', id: m.id })).messageContext).toHaveLength(1);
  });
});
