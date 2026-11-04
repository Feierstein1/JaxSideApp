import sharp from 'sharp';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as caseDecidePOST } from '@/app/api/v1/admin/cases/[type]/[id]/route';
import { GET as adminPhotoGET } from '@/app/api/v1/admin/photos/[id]/route';
import { GET as meGET } from '@/app/api/v1/me/route';
import { PUT as avatarPUT } from '@/app/api/v1/me/avatar/route';
import { POST as photosPOST } from '@/app/api/v1/photos/route';
import { GET as photoGET } from '@/app/api/v1/photos/[id]/route';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { POST as postDetailPOST } from '@/app/api/v1/posts/[id]/route';
import { DELETE as postDELETE } from '@/app/api/v1/posts/[id]/route';
import { POST as reportPOST } from '@/app/api/v1/reports/route';
import { POST as profilePOST } from '@/app/api/v1/users/[username]/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { runMaintenance } from '@/server/jobs/maintenance';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { setImageClassifier } from '@/server/media/classifier';
import { processImage, sniffImage } from '@/server/media/photos';
import { MemoryStore, setObjectStore } from '@/server/media/store';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

const HERE = { latitude: 30.3149, longitude: -81.6853 };
const reading = () => ({ ...HERE, accuracyMeters: 10, timestamp: Date.now() - 2_000 });
const DAY = 86_400_000;

let store: MemoryStore;
let ann: { id: string; token: string };
let bob: { id: string; token: string };

/** A real photo with GPS coordinates and camera details in its EXIF. */
let gpsJpeg: Buffer;

async function person(name: string, verified = true) {
  const u = await createTestUser(name, { emailVerifiedAt: verified ? new Date() : null });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
}

/** Uploads raw bytes like the app does. */
async function upload(token: string | undefined, body: Buffer, type = 'image/jpeg') {
  const headers: Record<string, string> = { 'content-type': type };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await (photosPOST as H)(
    new Request('http://localhost/x', { method: 'POST', headers, body: new Uint8Array(body) }),
    undefined as never,
  );
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : undefined };
}

/** Fetches a photo through its signed link. */
async function fetchPhoto(url: string) {
  const u = new URL(url, 'http://localhost');
  const id = u.pathname.split('/').pop()!;
  const res = await (photoGET as H)(new Request(u), { params: Promise.resolve({ id }) } as never);
  return {
    status: res.status,
    type: res.headers.get('content-type'),
    bytes: Buffer.from(await res.arrayBuffer()),
  };
}

beforeAll(async () => {
  gpsJpeg = await sharp({
    create: { width: 1200, height: 900, channels: 3, background: { r: 19, g: 102, b: 119 } },
  })
    .jpeg()
    .withExif({
      IFD0: { Make: 'TestPhone', Model: 'Model X', Software: 'SecretOS 1.0' },
      IFD3: {
        GPSLatitudeRef: 'N',
        GPSLatitude: '30/1 18/1 5364/100',
        GPSLongitudeRef: 'W',
        GPSLongitude: '81/1 41/1 718/100',
      },
    })
    .toBuffer();
});
afterAll(() => setImageClassifier(null));

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  invalidateConfigCache();
  store = new MemoryStore();
  setObjectStore(store);
  setImageClassifier(null);
  await importServiceArea(db, readBoundaryFile());
  ann = await person('ann_ph');
  bob = await person('bob_ph');
});

describe('processing (P6.2, P6.3, ✅MS5)', () => {
  it('an uploaded photo with GPS EXIF has none after processing', async () => {
    const before = await sharp(gpsJpeg).metadata();
    expect(before.exif?.toString('latin1')).toMatch(/GPS|TestPhone/);
    const r = await upload(ann.token, gpsJpeg);
    expect(r.status).toBe(201);
    const stored = [...store.objects.values()][0]!.body;
    const after = await sharp(stored).metadata();
    expect(after.exif).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(after.iptc).toBeUndefined();
    expect(stored.toString('latin1')).not.toMatch(/Exif|TestPhone|SecretOS|GPS/);
    expect(after.format).toBe('jpeg');
  });

  it('big photos are resized to 1600 px and the original bytes are never stored', async () => {
    const big = await sharp({
      create: { width: 4000, height: 3000, channels: 3, background: '#d8a328' },
    })
      .png()
      .toBuffer();
    const r = await upload(ann.token, big, 'image/png');
    expect(r.body).toMatchObject({ width: 1600, height: 1200 });
    expect(store.objects.size).toBe(1);
    expect([...store.objects.keys()][0]).toMatch(/^photos\/[0-9a-f]{48}\.jpg$/);
  });

  // 🔒 file type comes from the bytes, not the name or Content-Type.
  it.each([
    ['a script', Buffer.from('#!/bin/sh\nrm -rf /\n'.repeat(5))],
    [
      'an SVG',
      Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
    ],
    ['a PDF', Buffer.from('%PDF-1.7\n' + 'x'.repeat(100))],
    ['a Windows program', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200)])],
    ['a truncated JPEG', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 1, 0])],
  ])('refuses %s sent as image/jpeg', async (_label, bytes) => {
    const r = await upload(ann.token, bytes);
    expect(r.status).toBe(422);
    expect(r.body.error.code).toBe('INVALID_IMAGE');
    expect(store.objects.size).toBe(0);
  });

  it('sniffing recognizes real image types', async () => {
    expect(sniffImage(gpsJpeg)).toBe('jpeg');
    expect(sniffImage(await sharp(gpsJpeg).webp().toBuffer())).toBe('webp');
    expect(sniffImage(Buffer.from('GIF89a........'))).toBe('gif'); // D74
    expect(sniffImage(Buffer.from('GIF90a........'))).toBeNull();
    await expect(processImage(Buffer.from('GIF89a not really a gif'))).rejects.toMatchObject({
      status: 422,
    });
    await expect(processImage(Buffer.from('hello world, not an image'))).rejects.toMatchObject({
      status: 422,
    });
  });

  // D74: GIFs stay animated, are re-encoded, shrunk to 600 px and limited in length.
  const animatedGif = async (frames: number, w: number, h: number) => {
    const frame = (i: number) =>
      sharp({
        create: { width: w, height: h, channels: 3, background: { r: i * 20, g: 80, b: 160 } },
      })
        .png()
        .toBuffer();
    const pngs = await Promise.all(Array.from({ length: frames }, (_, i) => frame(i % 10)));
    return sharp(pngs, { join: { animated: true } })
      .gif()
      .toBuffer();
  };

  it('keeps a GIF animated, re-encoded and at most 600 px', async () => {
    const gif = await animatedGif(3, 1200, 600);
    const out = await processImage(gif);
    expect(out.mimeType).toBe('image/gif');
    expect([out.width, out.height]).toEqual([600, 300]);
    const meta = await sharp(out.data, { animated: true }).metadata();
    expect(meta.format).toBe('gif');
    expect(meta.pages).toBe(3);
    const r = await upload(ann.token, gif);
    expect(r.status).toBe(201);
    const photo = await db.photo.findUniqueOrThrow({ where: { id: r.body.id } });
    expect(photo.mimeType).toBe('image/gif');
    expect(photo.storageKey).toMatch(/\.gif$/);
  });

  it('refuses a GIF with too many frames', async () => {
    await expect(processImage(await animatedGif(301, 40, 40))).rejects.toMatchObject({
      status: 422,
    });
  });

  it('too large is refused before processing', async () => {
    await db.appConfiguration.create({ data: { key: 'photos.maxUploadMB', value: 0.001 } });
    invalidateConfigCache();
    expect((await upload(ann.token, gpsJpeg)).status).toBe(413);
  });

  // 🔒 P6.1: registered, confirmed users only.
  it('needs a signed-in, confirmed account', async () => {
    expect((await upload(undefined, gpsJpeg)).status).toBe(401);
    const unverified = await person('new_ph', false);
    expect((await upload(unverified.token, gpsJpeg)).status).toBe(403);
    expect((await upload(ann.token, gpsJpeg, 'text/plain')).status).toBe(415);
  });

  it('daily upload limit', async () => {
    await db.appConfiguration.create({ data: { key: 'rateLimit.upload.photosPerDay', value: 2 } });
    invalidateConfigCache();
    const codes = [];
    for (let i = 0; i < 3; i++) codes.push((await upload(ann.token, gpsJpeg)).status);
    expect(codes).toEqual([201, 201, 429]);
  });

  it('a classifier can block a photo (P6.6 hook)', async () => {
    setImageClassifier({
      classify: async () => ({ action: 'block', labels: [{ label: 'x', confidence: 1 }] }),
    });
    expect((await upload(ann.token, gpsJpeg)).status).toBe(422);
    expect(store.objects.size).toBe(0);
  });
});

describe('photos on posts and delivery (P6.1, P6.4, ✅MS6)', () => {
  async function postWithPhoto() {
    const photo = (await upload(ann.token, gpsJpeg)).body;
    const p = await call(postsPOST as H, 'POST', {
      token: ann.token,
      body: { reading: reading(), body: 'Sunset over the St. Johns', photoIds: [photo.id] },
    });
    expect(p.status).toBe(201);
    return { photoId: photo.id as string, post: p.body.post };
  }

  // D158: a photo post needs no text; a post with neither is still refused.
  it('posts photos with no caption, but not an empty post', async () => {
    const photo = (await upload(ann.token, gpsJpeg)).body;
    const p = await call(postsPOST as H, 'POST', {
      token: ann.token,
      body: { reading: reading(), photoIds: [photo.id] },
    });
    expect(p.status).toBe(201);
    expect(p.body.post).toMatchObject({ body: '', type: 'media' });
    const empty = await call(postsPOST as H, 'POST', {
      token: ann.token,
      body: { reading: reading(), body: '' },
    });
    expect(empty.status).toBe(400);
  });

  it('a post carries a signed link that serves the clean JPEG', async () => {
    const { post } = await postWithPhoto();
    expect(post.photos).toHaveLength(1);
    const view = await call(postDetailPOST as H, 'POST', {
      token: bob.token,
      id: post.id,
      body: { reading: reading() },
    });
    const url = view.body.post.photos[0].url as string;
    expect(url).toMatch(/^\/api\/v1\/photos\/[0-9a-f-]+\?exp=\d+&sig=/);
    const img = await fetchPhoto(url);
    expect(img.status).toBe(200);
    expect(img.type).toBe('image/jpeg');
    expect((await sharp(img.bytes).metadata()).exif).toBeUndefined();
    // No storage key or bucket name ever leaves the server.
    expect(JSON.stringify(view.body)).not.toMatch(/photos\/[0-9a-f]{48}|jax-media/);
  });

  // 🔒 links can't be forged or reused after they expire.
  it('tampered, expired or missing signatures get 403', async () => {
    const { post } = await postWithPhoto();
    const url = new URL(post.photos[0].url, 'http://localhost');
    const sig = url.searchParams.get('sig')!;
    url.searchParams.set('sig', (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1));
    expect((await fetchPhoto(url.toString())).status).toBe(403);
    url.searchParams.set('exp', String(Math.floor(Date.now() / 1000) - 10));
    expect((await fetchPhoto(url.toString())).status).toBe(403);
    expect((await fetchPhoto(`/api/v1/photos/${post.photos[0].id}`)).status).toBe(403);
  });

  // 🔒 removed or deleted content stops being served at once.
  it('a deleted post’s photo is 404, even with a valid link', async () => {
    const { post } = await postWithPhoto();
    await call(postDELETE as H, 'DELETE', { token: ann.token, id: post.id });
    expect((await fetchPhoto(post.photos[0].url)).status).toBe(404);
  });

  // 🔒 you can only attach your own, unused photos.
  it('someone else’s photo, or one already used, can’t be attached', async () => {
    const { photoId } = await postWithPhoto();
    const theirs = await call(postsPOST as H, 'POST', {
      token: bob.token,
      body: { reading: reading(), body: 'stealing a photo', photoIds: [photoId] },
    });
    expect(theirs.status).toBe(400);
    const again = await call(postsPOST as H, 'POST', {
      token: ann.token,
      body: { reading: reading(), body: 'reusing my photo', photoIds: [photoId] },
    });
    expect(again.status).toBe(400);
    expect(await db.generalPost.count()).toBe(1); // the failed posts were rolled back
  });

  it('photos are reportable; a moderator can see and remove them', async () => {
    const { photoId, post } = await postWithPhoto();
    const r = await call(reportPOST as H, 'POST', {
      token: bob.token,
      body: {
        reading: reading(),
        target: { type: 'photo', id: photoId },
        reason: 'SEXUAL_CONTENT',
      },
    });
    expect(r.status).toBe(202);
    const admin = await adminHeaders((await createTestUser('mod_ph', { role: 'ADMIN' })).id);
    const d = await call(caseDecidePOST as H, 'POST', {
      headers: admin,
      params: { type: 'photo', id: photoId },
      body: { decision: 'remove', reason: 'Not allowed', strike: true },
    });
    expect(d.status).toBe(200);
    expect((await fetchPhoto(post.photos[0].url)).status).toBe(404);
    const adminGet = (headers: Record<string, string>) =>
      (adminPhotoGET as H)(new Request('http://localhost/x', { headers }), {
        params: Promise.resolve({ id: photoId }),
      } as never);
    expect((await adminGet(admin)).status).toBe(200);
    // …but not without the admin cookie.
    expect((await adminGet({ authorization: `Bearer ${bob.token}` })).status).toBe(401);
    const after = await call(postDetailPOST as H, 'POST', {
      token: bob.token,
      id: post.id,
      body: { reading: reading() },
    });
    expect(after.body.post.photos).toEqual([]);
  });

  it('unused uploads are deleted after a day', async () => {
    await upload(ann.token, gpsJpeg);
    await db.photo.updateMany({ data: { createdAt: new Date(Date.now() - 2 * DAY) } });
    expect((await runMaintenance())?.unusedPhotosDeleted).toBe(1);
    expect(store.objects.size).toBe(0);
    expect(await db.photo.count()).toBe(0);
  });
});

describe('profile photos (P6.5)', () => {
  it('set your own photo; it appears on your profile', async () => {
    const photo = (await upload(ann.token, gpsJpeg)).body;
    expect(
      (await call(avatarPUT as H, 'PUT', { token: ann.token, body: { photoId: photo.id } })).status,
    ).toBe(200);
    const me = await call(meGET as H, 'GET', { token: ann.token });
    expect(me.body.user.avatarUrl).toMatch(/^\/api\/v1\/photos\//);
    const prof = await call(profilePOST as H, 'POST', {
      token: bob.token,
      params: { username: 'ann_ph' },
      body: { reading: reading() },
    });
    expect((await fetchPhoto(prof.body.profile.avatarUrl)).status).toBe(200);
    // Someone else can't use it.
    expect(
      (await call(avatarPUT as H, 'PUT', { token: bob.token, body: { photoId: photo.id } })).status,
    ).toBe(400);
    // A banned account's photo stops being served.
    await db.user.update({ where: { id: ann.id }, data: { status: 'BANNED' } });
    expect((await fetchPhoto(prof.body.profile.avatarUrl)).status).toBe(404);
  });
});
