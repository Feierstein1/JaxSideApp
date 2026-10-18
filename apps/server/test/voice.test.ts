import { beforeEach, describe, expect, it } from 'vitest';
import { PUT as avatarPUT } from '@/app/api/v1/me/avatar/route';
import { GET as mediaGET } from '@/app/api/v1/photos/[id]/route';
import { POST as feedPOST } from '@/app/api/v1/feed/route';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { POST as voicePOST } from '@/app/api/v1/voice/route';
import { getCase } from '@/server/admin/queue';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { MemoryStore, setObjectStore } from '@/server/media/store';
import { processVoice } from '@/server/media/voice';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D75: voice posts.

const HERE = { latitude: 30.3149, longitude: -81.6853 };
const reading = () => ({ ...HERE, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

// ── A minimal .m4a, built box by box like a phone recorder writes it ──
const u32 = (n: number) => {
  const b = Buffer.alloc(4);
  b.writeUInt32BE(n);
  return b;
};
const box = (type: string, ...parts: Buffer[]) => {
  const body = Buffer.concat(parts);
  return Buffer.concat([u32(8 + body.length), Buffer.from(type, 'latin1'), body]);
};
const mvhd = (ms: number) => {
  const b = Buffer.alloc(100);
  b.writeUInt32BE(1000, 12); // timescale: 1000 per second
  b.writeUInt32BE(ms, 16); // duration
  return box('mvhd', b);
};
const hdlr = (t: string) => {
  const b = Buffer.alloc(24);
  b.write(t, 8, 'latin1');
  return box('hdlr', b);
};
const trak = (t: string) => box('trak', box('mdia', hdlr(t)), box('udta', Buffer.from('cam')));
/** Location metadata a recorder might write (QuickTime ©xyz). */
const LOCATION = '+30.3149-081.6853/';
function m4a(opts: { ms?: number; tracks?: string[]; brand?: string } = {}) {
  return Buffer.concat([
    box('ftyp', Buffer.from(opts.brand ?? 'M4A '), u32(0), Buffer.from('M4A isom')),
    box(
      'moov',
      mvhd(opts.ms ?? 5000),
      ...(opts.tracks ?? ['soun']).map(trak),
      box('udta', box('©xyz', Buffer.from(LOCATION))),
    ),
    box('mdat', Buffer.alloc(3000, 7)),
  ]);
}

let store: MemoryStore;
let ann: { id: string; token: string };
let bob: { id: string; token: string };

async function person(name: string) {
  const u = await createTestUser(name, { emailVerifiedAt: new Date() });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
}

async function upload(token: string, body: Buffer, type = 'audio/mp4') {
  const res = await (voicePOST as H)(
    new Request('http://localhost/x', {
      method: 'POST',
      headers: { 'content-type': type, authorization: `Bearer ${token}` },
      body: new Uint8Array(body),
    }),
    undefined as never,
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

const post = (token: string, body: Record<string, unknown>) =>
  call(postsPOST as H, 'POST', { token, body: { reading: reading(), ...body } });
const feed = (token: string, type?: string) =>
  call(feedPOST as H, 'POST', { token, body: { reading: reading(), ...(type ? { type } : {}) } });

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  await db.appConfiguration.createMany({
    data: [
      { key: 'rateLimit.post.perMinute', value: 100 },
      { key: 'rateLimit.post.perDay', value: 100 },
    ],
  });
  invalidateConfigCache();
  store = new MemoryStore();
  setObjectStore(store);
  await importServiceArea(db, readBoundaryFile());
  ann = await person('ann_v');
  bob = await person('bob_v');
});

describe('checking a voice clip (D75)', () => {
  it('accepts a recording, reads its length, and blanks location metadata', async () => {
    const input = m4a({ ms: 12_345 });
    const copy = Buffer.from(input);
    const out = await processVoice(input, 60);
    expect(out.durationMs).toBe(12_345);
    expect(out.data.length).toBe(input.length); // nothing moves, so it still plays
    expect(out.data.toString('latin1')).not.toContain('udta');
    expect(input.equals(copy)).toBe(true); // the caller's buffer is untouched
    // The location and camera bytes are gone, not just hidden.
    expect(out.data.toString('latin1')).not.toContain(LOCATION);
    expect(out.data.toString('latin1')).not.toContain('cam');
    expect(out.data.toString('latin1')).toContain('free');
  });

  // 🔒 A "voice" upload can't carry video or anything else.
  it.each([
    ['a video track', m4a({ tracks: ['soun', 'vide'] })],
    ['only video', m4a({ tracks: ['vide'] })],
    ['an unknown brand', m4a({ brand: 'qt  ' })],
    ['a JPEG', Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.alloc(40)])],
    ['a truncated file', m4a().subarray(0, 60)],
    ['text', Buffer.from('hello, this is not audio at all')],
  ])('refuses %s', async (_label, bytes) => {
    await expect(processVoice(bytes, 60)).rejects.toMatchObject({ status: 422 });
  });

  it('enforces the length limit (60 s, with a second of slack) and a minimum', async () => {
    await expect(processVoice(m4a({ ms: 60_900 }), 60)).resolves.toBeTruthy();
    await expect(processVoice(m4a({ ms: 61_500 }), 60)).rejects.toMatchObject({
      message: 'Voice posts can be up to 60 seconds.',
    });
    await expect(processVoice(m4a({ ms: 200 }), 60)).rejects.toMatchObject({ status: 422 });
  });
});

describe('voice posts (D75)', () => {
  it('upload → post with no caption → shows in the feed as a voice post', async () => {
    const up = await upload(ann.token, m4a({ ms: 8000 }));
    expect(up.status).toBe(201);
    expect(up.body.durationMs).toBe(8000);
    const stored = [...store.objects.values()][0]!;
    expect(stored.body.toString('latin1')).not.toContain(LOCATION);
    const r = await post(ann.token, { body: '', voiceId: up.body.id });
    expect(r.status).toBe(201);
    expect(r.body.post).toMatchObject({ type: 'voice', body: '', photos: [] });
    expect(r.body.post.voice).toMatchObject({ id: up.body.id, durationMs: 8000 });
    // The signed link serves it as audio, in byte ranges for players that ask.
    const u = new URL(r.body.post.voice.url, 'http://localhost');
    const res = await (mediaGET as H)(new Request(u, { headers: { range: 'bytes=0-99' } }), {
      params: Promise.resolve({ id: up.body.id }),
    } as never);
    expect(res.status).toBe(206);
    expect(res.headers.get('content-type')).toBe('audio/mp4');
    expect(res.headers.get('content-range')).toBe(`bytes 0-99/${stored.body.length}`);
    expect((await res.arrayBuffer()).byteLength).toBe(100);
  });

  it('filters the feed by type: text, media, voice', async () => {
    const up = await upload(ann.token, m4a());
    await post(ann.token, { body: 'listen to this', voiceId: up.body.id });
    await post(ann.token, { body: 'just words here' });
    const types = async (t?: string) =>
      (await feed(bob.token, t)).body.posts.map((p: { body: string }) => p.body);
    expect(await types('voice')).toEqual(['listen to this']);
    expect(await types('text')).toEqual(['just words here']);
    expect(await types('media')).toEqual([]);
    expect(await types('all')).toEqual(['just words here', 'listen to this']);
    expect((await feed(bob.token, 'podcasts')).status).toBe(400);
  });

  // 🔒 Ownership and kind are checked on the server.
  it('a clip can only be used once, by its uploader, as a voice clip', async () => {
    const up = await upload(ann.token, m4a());
    expect((await post(bob.token, { body: '', voiceId: up.body.id })).body.error.code).toBe(
      'INVALID_VOICE',
    );
    expect(
      (await post(ann.token, { body: 'sneaky', photoIds: [up.body.id] })).body.error.code,
    ).toBe('INVALID_PHOTO');
    const avatar = await call(avatarPUT as H, 'PUT', {
      token: ann.token,
      body: { photoId: up.body.id },
    });
    expect(avatar.body.error.code).toBe('INVALID_PHOTO');
    expect((await post(ann.token, { body: '', voiceId: up.body.id })).status).toBe(201);
    expect((await post(ann.token, { body: '', voiceId: up.body.id })).body.error.code).toBe(
      'INVALID_VOICE',
    );
  });

  it('needs text unless it has a clip, and can’t mix a clip with photos', async () => {
    expect((await post(ann.token, { body: '' })).status).toBe(400);
    const up = await upload(ann.token, m4a());
    const mixed = await post(ann.token, {
      body: 'both',
      voiceId: up.body.id,
      photoIds: ['00000000-0000-7000-8000-000000000000'],
    });
    expect(mixed.status).toBe(400);
  });

  it('refuses non-audio content types and oversized clips', async () => {
    expect((await upload(ann.token, m4a(), 'image/jpeg')).status).toBe(415);
    await db.appConfiguration.create({ data: { key: 'voice.maxUploadMB', value: 0.001 } });
    invalidateConfigCache();
    expect((await upload(ann.token, m4a())).status).toBe(413);
  });

  it('a reported voice post is playable on the moderator’s case page', async () => {
    const up = await upload(ann.token, m4a());
    const r = await post(ann.token, { body: 'hear me', voiceId: up.body.id });
    const c = await getCase({ type: 'general', id: r.body.post.id });
    expect(c.voiceUrl).toBe(`/api/v1/admin/photos/${up.body.id}`);
  });
});
