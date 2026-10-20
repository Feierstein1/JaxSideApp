import { beforeEach, describe, expect, it } from 'vitest';
import { POST as feedPOST } from '@/app/api/v1/feed/route';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { POST as videosPOST } from '@/app/api/v1/videos/route';
import { getCase } from '@/server/admin/queue';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { MemoryStore, setObjectStore } from '@/server/media/store';
import { processVideo } from '@/server/media/video';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D102: video posts, checked and cleaned without transcoding.

const HERE = { latitude: 30.3149, longitude: -81.6853 };
const reading = () => ({ ...HERE, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

// ── A minimal phone video, box by box ──
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
  b.writeUInt32BE(1000, 12);
  b.writeUInt32BE(ms, 16);
  return box('mvhd', b);
};
const tkhd = (w: number, h: number) => {
  const b = Buffer.alloc(84);
  b.writeUInt32BE(w * 65536, 76);
  b.writeUInt32BE(h * 65536, 80);
  return box('tkhd', b);
};
const hdlr = (t: string) => {
  const b = Buffer.alloc(24);
  b.write(t, 8, 'latin1');
  return box('hdlr', b);
};
/** One sample of `size` bytes at file offset `offset`. */
const stbl = (offset: number, size: number) =>
  box(
    'stbl',
    box('stsz', u32(0), u32(0), u32(1), u32(size)),
    box('stsc', u32(0), u32(1), u32(1), u32(1), u32(1)),
    box('stco', u32(0), u32(1), u32(offset)),
  );
const trak = (type: string, offset: number, size: number, w = 0, h = 0) =>
  box('trak', tkhd(w, h), box('mdia', hdlr(type), box('minf', stbl(offset, size))));

const PICTURE = Buffer.alloc(400, 0x42); // stands in for compressed video
const SECRET = Buffer.from('com.apple.quicktime.location.ISO6709 +30.3149-081.6853/');

function video(opts: { ms?: number; brand?: string; tracks?: ('vide' | 'soun' | 'mebx')[] } = {}) {
  const tracks = opts.tracks ?? ['vide', 'soun', 'mebx'];
  const ftyp = box('ftyp', Buffer.from(opts.brand ?? 'qt  '), u32(0), Buffer.from('qt  '));
  const build = (mdatStart: number) => {
    let at = mdatStart + 8;
    const parts: Buffer[] = [];
    const tr: Buffer[] = [];
    for (const t of tracks) {
      const data = t === 'mebx' ? SECRET : t === 'vide' ? PICTURE : Buffer.alloc(100, 0x11);
      tr.push(trak(t, at, data.length, t === 'vide' ? 1080 : 0, t === 'vide' ? 1920 : 0));
      parts.push(data);
      at += data.length;
    }
    const moov = box(
      'moov',
      mvhd(opts.ms ?? 8000),
      ...tr,
      box('meta', Buffer.from('com.apple.quicktime.location +30.31-081.68')),
    );
    return { moov, mdat: box('mdat', ...parts) };
  };
  const first = build(0);
  const { moov, mdat } = build(ftyp.length + first.moov.length);
  return Buffer.concat([ftyp, moov, mdat]);
}

let token: string;
beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  invalidateConfigCache();
  setObjectStore(new MemoryStore());
  await importServiceArea(db, readBoundaryFile());
  const u = await createTestUser('vid_u', { emailVerifiedAt: new Date() });
  token = (await createSession(u.id, 'MOBILE')).token;
});

async function upload(body: Buffer, type = 'video/quicktime') {
  const res = await (videosPOST as H)(
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

describe('checking a video (D102)', () => {
  it('keeps picture and sound, removes the metadata track and location boxes', async () => {
    const input = video();
    const out = await processVideo(input, 30);
    expect(out).toMatchObject({
      durationMs: 8000,
      width: 1080,
      height: 1920,
      mimeType: 'video/quicktime',
    });
    expect(out.data.length).toBe(input.length); // nothing moves
    const text = out.data.toString('latin1');
    expect(text).not.toContain('location'); // neither the meta box nor the timed sample
    expect(text).not.toContain('+30.31');
    expect(text).not.toContain('mebx');
    expect(out.data.includes(PICTURE)).toBe(true); // the video itself is untouched
  });

  it.each([
    ['audio only', video({ tracks: ['soun'] })],
    ['an unknown brand', video({ brand: 'abcd' })],
    ['a photo', Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.alloc(40)])],
    ['a truncated file', video().subarray(0, 80)],
  ])('refuses %s', async (_l, bytes) => {
    await expect(processVideo(bytes, 30)).rejects.toMatchObject({ status: 422 });
  });

  it('enforces 30 seconds', async () => {
    await expect(processVideo(video({ ms: 31_500 }), 30)).rejects.toMatchObject({
      message: 'Videos can be up to 30 seconds.',
    });
    await expect(processVideo(video({ ms: 30_800, brand: 'isom' }), 30)).resolves.toMatchObject({
      mimeType: 'video/mp4',
    });
  });
});

describe('video posts (D102)', () => {
  it('upload → post (no caption needed) → Video tab; one kind of attachment per post', async () => {
    const up = await upload(video());
    expect(up.status).toBe(201);
    const post = await call(postsPOST as H, 'POST', {
      token,
      body: { reading: reading(), body: '', videoId: up.body.id },
    });
    expect(post.status).toBe(201);
    expect(post.body.post).toMatchObject({ type: 'video', video: { id: up.body.id, width: 1080 } });
    const tab = await call(feedPOST as H, 'POST', {
      token,
      body: { reading: reading(), type: 'video' },
    });
    expect(tab.body.posts).toHaveLength(1);
    const c = await getCase({ type: 'general', id: post.body.post.id });
    expect(c.videoUrl).toBe(`/api/v1/admin/photos/${up.body.id}`);
    // Photos and a video together are refused.
    const up2 = await upload(video());
    const mixed = await call(postsPOST as H, 'POST', {
      token,
      body: {
        reading: reading(),
        body: 'both',
        videoId: up2.body.id,
        photoIds: ['00000000-0000-7000-8000-000000000000'],
      },
    });
    expect(mixed.status).toBe(400);
  });

  it('refuses other content types and oversized files', async () => {
    expect((await upload(video(), 'image/jpeg')).status).toBe(415);
    await db.appConfiguration.create({ data: { key: 'video.maxUploadMB', value: 0.0001 } });
    invalidateConfigCache();
    expect((await upload(video())).status).toBe(413);
  });
});
