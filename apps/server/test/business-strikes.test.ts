import { beforeEach, describe, expect, it } from 'vitest';
import { GET as adminPicGET } from '@/app/api/v1/admin/business-pictures/[id]/route';
import { POST as actPOST } from '@/app/api/v1/admin/businesses/[id]/route';
import { POST as strikePOST } from '@/app/api/v1/admin/businesses/[id]/strikes/route';
import { GET as picGET } from '@/app/api/v1/business-pictures/[id]/route';
import { POST as roomListPOST } from '@/app/api/v1/places/[id]/posts/list/route';
import { getBusiness } from '@/server/admin/businesses';
import { generateToken, hashToken } from '@/server/auth/crypto';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { signedBusinessPictureUrl, signedPhotoUrl } from '@/server/media/photos';
import { MemoryStore, setObjectStore } from '@/server/media/store';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D191: strikes for business logins (same ladder as people, per login, given from the admin
// portal). D189: a business login's profile picture, shown in the app and removable by admins.

const DAY = 86_400_000;
const HERE = { latitude: 30.3151, longitude: -81.686 };
const reading = () => ({ ...HERE, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

let admin: Record<string, string>;
let cafe: string;
let owner: { id: string };
let sam: { id: string };
let fan: { id: string; token: string };
let samPost: string;

async function bizSession(accountId: string) {
  await db.businessSession.create({
    data: {
      accountId,
      tokenHash: hashToken(generateToken()),
      csrfTokenHash: hashToken(generateToken()),
      expiresAt: new Date(Date.now() + 3_600_000),
    },
  });
}
const strike = (id: string, body: object, headers = admin) =>
  call(strikePOST as H, 'POST', { headers, params: { id }, body });
const reportOn = (businessPostId: string) =>
  db.report.create({ data: { reporterUserId: fan.id, businessPostId, reason: 'THREAT' } });
const notices = (accountId: string) =>
  db.businessNotice.findMany({
    where: { accountId, kind: 'STRIKE' },
    orderBy: { createdAt: 'asc' },
  });

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  // Several strikes a test: past the portal's per-minute limit for one admin.
  await db.appConfiguration.create({
    data: { key: 'rateLimit.adminAction.perMinute', value: 1000 },
  });
  await importServiceArea(db, readBoundaryFile());
  invalidateConfigCache();
  setObjectStore(new MemoryStore());
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
  admin = await adminHeaders((await createTestUser('mod_s', { role: 'ADMIN' })).id);
  const u = await createTestUser('fan_s', {
    emailVerifiedAt: new Date(),
    createdAt: new Date(Date.now() - 10 * DAY),
  });
  fan = { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
  owner = await db.businessAccount.create({
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
  samPost = (
    await db.businessPost.create({
      data: { placeId: cafe, businessAuthorId: sam.id, body: 'Buy cheap pills at example.com' },
    })
  ).id;
  await bizSession(owner.id);
  await bizSession(sam.id);
}, 60_000);

describe('the strike ladder for business logins (D191)', () => {
  it('warns, suspends 24 h, then 7 days, then bans: only the login that wrote it', async () => {
    const reasons = ['Ads in the discussion', 'Again', 'Third time', 'Last one'];
    const results = [];
    for (const reason of reasons) {
      const r = await strike(sam.id, { action: 'strike', reason });
      expect(r.status).toBe(200);
      results.push(r.body.result.action);
    }
    expect(results).toEqual(['WARN', 'SUSPEND', 'SUSPEND', 'BAN']);
    const actions = await db.moderationAction.findMany({
      where: { targetBusinessId: sam.id },
      orderBy: { createdAt: 'asc' },
    });
    expect(actions.map((a) => a.durationHours)).toEqual([null, 24, 168, null]);

    const s = await db.businessAccount.findUniqueOrThrow({ where: { id: sam.id } });
    expect(s.revokedAt).not.toBeNull();
    expect(
      await db.businessPlaceAccess.count({ where: { accountId: sam.id, revokedAt: null } }),
    ).toBe(0);
    expect(await db.businessSession.count({ where: { accountId: sam.id, revokedAt: null } })).toBe(
      0,
    );
    // The Owner keeps its account, access and session.
    const o = await db.businessAccount.findUniqueOrThrow({ where: { id: owner.id } });
    expect(o.revokedAt).toBeNull();
    expect(
      await db.businessSession.count({ where: { accountId: owner.id, revokedAt: null } }),
    ).toBe(1);

    // A STRIKE notice for each step in Sam's bell, and a copy for the Owner.
    const mine = await notices(sam.id);
    expect(mine.map((n) => n.title)).toEqual([
      'Warning from JaxSide',
      'Suspended for 1 day',
      'Suspended for 7 days',
      'Your login was closed by JaxSide',
    ]);
    expect(mine[0]).toMatchObject({ body: 'Ads in the discussion', link: '/account/standing' });
    expect((await notices(owner.id)).map((n) => n.title)).toEqual(
      mine.map((n) => `sam.bb: ${n.title}`),
    );
    // Revoked: no more strikes.
    expect((await strike(sam.id, { action: 'strike', reason: 'More' })).status).toBe(409);
  });

  it('a strike suspension shows on the admin page, ends sessions and lifts with Unsuspend', async () => {
    await strike(sam.id, { action: 'strike', reason: 'First' });
    await strike(sam.id, { action: 'strike', reason: 'Second' });
    const page = await getBusiness(sam.id);
    expect(page.status).toBe('SUSPENDED');
    expect(page.suspendedUntil).not.toBeNull();
    expect(page.nextStrike).toMatchObject({ action: 'SUSPEND', strike: 3, hours: 168 });
    expect(await db.businessSession.count({ where: { accountId: sam.id, revokedAt: null } })).toBe(
      0,
    );
    const lift = await call(actPOST as H, 'POST', {
      headers: admin,
      params: { id: sam.id },
      body: { action: 'unsuspend' },
    });
    expect(lift.status).toBe(200);
    expect((await getBusiness(sam.id)).status).toBe('ACTIVE');
  });

  it('an Owner’s ban closes its staff logins too', async () => {
    for (let i = 0; i < 4; i++) await strike(owner.id, { action: 'strike', reason: `Strike ${i}` });
    const logins = await db.businessAccount.findMany({ where: { revokedAt: null } });
    expect(logins).toHaveLength(0);
    expect(await notices(owner.id)).toHaveLength(4);
    expect(await notices(sam.id)).toHaveLength(0); // the strikes were the Owner's
  });

  it('cancelling a suspension strike lifts it; a ban can’t be cancelled', async () => {
    await strike(sam.id, { action: 'strike', reason: 'First' });
    await strike(sam.id, { action: 'strike', reason: 'Second' });
    const susp = await db.moderationAction.findFirstOrThrow({
      where: { targetBusinessId: sam.id, action: 'SUSPEND' },
    });
    const v = await strike(sam.id, { action: 'void', strikeId: susp.id, reason: 'Appeal ok' });
    expect(v.status).toBe(200);
    expect(
      (await db.businessAccount.findUniqueOrThrow({ where: { id: sam.id } })).suspendedUntil,
    ).toBeNull();
    // The cancelled one no longer counts: the next strike is a 24 h suspension again.
    expect((await getBusiness(sam.id)).nextStrike).toMatchObject({ action: 'SUSPEND', hours: 24 });

    for (const reason of ['Third', 'Fourth', 'Fifth']) {
      expect((await strike(sam.id, { action: 'strike', reason })).status).toBe(200);
    }
    const ban = await db.moderationAction.findFirstOrThrow({
      where: { targetBusinessId: sam.id, action: 'BAN' },
    });
    const r = await strike(sam.id, { action: 'void', strikeId: ban.id, reason: 'Please' });
    expect(r.body.error.code).toBe('BAN_FINAL');
  });
});

describe('Notify from a report about business-written content (D191)', () => {
  it('lists the report on the login’s page and gives one strike tied to it', async () => {
    const rep = await reportOn(samPost);
    const page = await getBusiness(sam.id);
    expect(page.reports.map((r) => r.id)).toEqual([rep.id]);
    expect((await getBusiness(owner.id)).reports).toHaveLength(0); // Sam wrote it
    const r = await strike(sam.id, { action: 'strike', reason: 'Threats', reportId: rep.id });
    expect(r.body.result.action).toBe('WARN');
    expect((await notices(sam.id))[0]?.placeId).toBe(cafe);
    expect((await getBusiness(sam.id)).reports[0]?.strike).toMatchObject({ action: 'WARN' });
    // 🔒 One strike per report.
    const again = await strike(sam.id, { action: 'strike', reason: 'Again', reportId: rep.id });
    expect(again.body.error.code).toBe('ALREADY_NOTIFIED');
  });

  // 🔒 A report about someone else can't be used to strike this login.
  it('refuses a report that isn’t about this login, and anyone but an admin', async () => {
    const rep = await reportOn(samPost);
    const r = await strike(owner.id, { action: 'strike', reason: 'Nope', reportId: rep.id });
    expect(r.status).toBe(404);
    expect(await db.moderationAction.count()).toBe(0);
    const noAdmin = await call(strikePOST as H, 'POST', {
      token: fan.token,
      params: { id: sam.id },
      body: { action: 'strike', reason: 'Not an admin' },
    });
    expect([401, 403]).toContain(noAdmin.status);
    expect(await db.moderationAction.count()).toBe(0);
  });

  // 🔒 A moderation action is about a person or a business login, never both.
  it('the database refuses an action aimed at both a person and a business', async () => {
    const adminRow = await db.user.findFirstOrThrow({ where: { role: 'ADMIN' } });
    await expect(
      db.moderationAction.create({
        data: {
          adminId: adminRow.id,
          action: 'WARN',
          reason: 'x',
          targetUserId: fan.id,
          targetBusinessId: sam.id,
        },
      }),
    ).rejects.toThrow();
  });
});

describe('business profile pictures (D189)', () => {
  async function givePicture(accountId: string) {
    const { objectStore } = await import('@/server/media/store');
    await objectStore().put('biz/pic.jpg', Buffer.from('jpeg-bytes'), 'image/jpeg');
    const m = await db.adMedia.create({
      data: { accountId, storageKey: 'biz/pic.jpg', status: 'ACTIVE', mimeType: 'image/jpeg' },
    });
    await db.businessAccount.update({ where: { id: accountId }, data: { avatarMediaId: m.id } });
    return m.id;
  }
  const fetchPic = async (url: string) => {
    const u = new URL(url, 'http://localhost');
    const id = u.pathname.split('/').pop()!;
    const res = await (picGET as H)(new Request(u), { params: Promise.resolve({ id }) } as never);
    return res.status;
  };
  const roomAuthor = async () =>
    (
      await call(roomListPOST as H, 'POST', {
        token: fan.token,
        id: cafe,
        body: { reading: reading() },
      })
    ).body.posts[0].author as { theOwner: true; avatarUrl: string | null };

  it('shows the writing login’s picture beside "The Owner" and serves it by signed link', async () => {
    const id = await givePicture(sam.id);
    const author = await roomAuthor();
    expect(author).toMatchObject({ theOwner: true, staffName: 'Sam' });
    expect(author.avatarUrl).toContain(`/api/v1/business-pictures/${id}`);
    expect(await fetchPic(author.avatarUrl!)).toBe(200);
  });

  // 🔒 Forged links, and a photo link for the same ID, don't open a business picture.
  it('refuses forged or photo-signed links', async () => {
    const id = await givePicture(sam.id);
    expect(await fetchPic(`/api/v1/business-pictures/${id}?exp=9999999999&sig=nope`)).toBe(403);
    const photoLink = new URL(signedPhotoUrl(id), 'http://localhost');
    expect(await fetchPic(`/api/v1/business-pictures/${id}${photoLink.search}`)).toBe(403);
    expect(await fetchPic(signedBusinessPictureUrl(id))).toBe(200);
  });

  it('an admin removes it: gone from the app, still viewable in the portal', async () => {
    const id = await givePicture(sam.id);
    const link = signedBusinessPictureUrl(id);
    expect((await getBusiness(sam.id)).avatarUrl).toBe(`/api/v1/admin/business-pictures/${id}`);
    const r = await call(actPOST as H, 'POST', {
      headers: admin,
      params: { id: sam.id },
      body: { action: 'remove-picture' },
    });
    expect(r.status).toBe(200);
    expect((await roomAuthor()).avatarUrl).toBeNull();
    expect(await fetchPic(link)).toBe(404);
    expect((await db.adMedia.findUniqueOrThrow({ where: { id } })).status).toBe('REMOVED');
    // Evidence: the portal still opens it.
    const adminRes = await (adminPicGET as H)(
      new Request('http://localhost/x', { headers: admin }),
      { params: Promise.resolve({ id }) } as never,
    );
    expect(adminRes.status).toBe(200);
    // Nothing left to remove.
    const again = await call(actPOST as H, 'POST', {
      headers: admin,
      params: { id: sam.id },
      body: { action: 'remove-picture' },
    });
    expect(again.body.error.code).toBe('NO_PICTURE');
  });
});
