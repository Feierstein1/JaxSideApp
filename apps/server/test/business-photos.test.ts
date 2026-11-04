import { beforeEach, describe, expect, it } from 'vitest';
import { GET as photoGET } from '@/app/api/v1/photos/[id]/route';
import { POST as roomListPOST } from '@/app/api/v1/places/[id]/posts/list/route';
import { getBusiness } from '@/server/admin/businesses';
import { getCase } from '@/server/admin/queue';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { runMaintenance } from '@/server/jobs/maintenance';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { MemoryStore, setObjectStore } from '@/server/media/store';
import { createReport } from '@/server/reports';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D195: pictures and videos a business login uploads on the owner website live in `Photo`
// with `uploaderBusinessId` (no person). The app shows them on the place's posts like a
// person's, cleans up unattached ones, and handles reports on them.

const DAY = 86_400_000;
const HERE = { latitude: 30.3151, longitude: -81.686 };
const reading = () => ({ ...HERE, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

let store: MemoryStore;
let cafe: string;
let sam: { id: string };
let fan: Awaited<ReturnType<typeof createTestUser>>;
let fanToken: string;
let postId: string;

/** A business upload as the website writes it. */
async function businessPhoto(businessPostId: string | null, createdAt = new Date()) {
  const key = `photos/biz-${Math.random().toString(36).slice(2)}.jpg`;
  await store.put(key, Buffer.from('jpeg-bytes'), 'image/jpeg');
  return db.photo.create({
    data: {
      uploaderBusinessId: sam.id,
      storageKey: key,
      status: 'ACTIVE',
      mimeType: 'image/jpeg',
      width: 400,
      height: 300,
      businessPostId,
      createdAt,
    },
  });
}

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  await importServiceArea(db, readBoundaryFile());
  invalidateConfigCache();
  store = new MemoryStore();
  setObjectStore(store);
  await importOsmPlaces(db, [
    {
      type: 'node',
      id: 1,
      lat: 30.315,
      lon: -81.686,
      tags: { amenity: 'cafe', name: 'Bold Bean' },
    },
  ]);
  cafe = (await db.businessPlace.findFirstOrThrow()).id;
  const owner = await db.businessAccount.create({
    data: { email: 'owner@boldbean.com', passwordHash: 'x' },
  });
  sam = await db.businessAccount.create({
    data: { username: 'sam.bb', passwordHash: 'x', createdById: owner.id },
  });
  await db.businessPlaceAccess.createMany({
    data: [
      { accountId: owner.id, placeId: cafe, role: 'OWNER' },
      { accountId: sam.id, placeId: cafe, role: 'STAFF', staffName: 'Sam' },
    ],
  });
  postId = (
    await db.businessPost.create({
      data: { placeId: cafe, businessAuthorId: sam.id, body: 'New menu!' },
    })
  ).id;
  await db.businessPlace.update({ where: { id: cafe }, data: { postCount: 1 } });
  fan = await createTestUser('fan_p', {
    emailVerifiedAt: new Date(),
    createdAt: new Date(Date.now() - 30 * DAY),
  });
  fanToken = (await createSession(fan.id, 'MOBILE')).token;
}, 60_000);

describe('business uploads in Photo (D195)', () => {
  it('show on the business post in the app and are served by signed link', async () => {
    const ph = await businessPhoto(postId);
    const room = await call(roomListPOST as H, 'POST', {
      token: fanToken,
      id: cafe,
      body: { reading: reading() },
    });
    const post = room.body.posts[0] as { photos: { id: string; url: string }[] };
    expect(post.photos.map((p) => p.id)).toEqual([ph.id]);
    const u = new URL(post.photos[0]!.url, 'http://localhost');
    const res = await (photoGET as H)(new Request(u), {
      params: Promise.resolve({ id: ph.id }),
    } as never);
    expect(res.status).toBe(200);
  });

  it('unattached business uploads are deleted after a day, like a person’s', async () => {
    await businessPhoto(null, new Date(Date.now() - 2 * DAY));
    expect((await runMaintenance())?.unusedPhotosDeleted).toBe(1);
    expect(store.objects.size).toBe(0);
  });

  it('a report on one names the business in the queue and can strike that login', async () => {
    const ph = await businessPhoto(postId);
    await createReport(
      { kind: 'user', user: fan },
      { target: { type: 'photo', id: ph.id }, reason: 'SPAM' },
    );
    const c = await getCase({ type: 'photo', id: ph.id });
    expect(c.author).toMatchObject({ business: true });
    expect(JSON.stringify(c.author)).toContain('sam.bb');
    // Listed on the login's page, so Notify (D191) can give it a strike.
    expect((await getBusiness(sam.id)).reports.map((r) => r.what)).toEqual(['photo']);
  });

  // 🔒 A photo has exactly one uploader: a person or a business login.
  it('the database refuses a photo with no uploader, or with both', async () => {
    await expect(db.photo.create({ data: { status: 'ACTIVE' } })).rejects.toThrow();
    await expect(
      db.photo.create({ data: { uploaderId: fan.id, uploaderBusinessId: sam.id } }),
    ).rejects.toThrow();
  });
});
