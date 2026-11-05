import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as decidePOST } from '@/app/api/v1/admin/owner-claims/[id]/route';
import { POST as cancelPOST } from '@/app/api/v1/owner-claims/[id]/cancel/route';
import { POST as confirmPOST } from '@/app/api/v1/owner-claims/[id]/confirm/route';
import { POST as proofPOST } from '@/app/api/v1/owner-claims/[id]/proof/route';
import { GET as claimsGET, POST as claimPOST } from '@/app/api/v1/places/[id]/owner-claims/route';
import { POST as roomPostPOST } from '@/app/api/v1/places/[id]/posts/route';
import { POST as postsPOST } from '@/app/api/v1/posts/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { emailMatchesWebsite, listOwnerClaims } from '@/server/directory/owners';
import { importOsmPlaces } from '@/server/directory/osm';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { setMailer, type OutgoingMail } from '@/server/mail/mailer';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D103: verified business owners (D92).

const HERE = { latitude: 30.315, longitude: -81.686 };
const reading = () => ({ ...HERE, accuracyMeters: 10, timestamp: Date.now() - 2_000 });

type P = { id: string; token: string };
let ann: P;
let bob: P;
let cafe: string; // has a website and phone
let shop: string; // has neither
let admin: Record<string, string>;
let mail: OutgoingMail[];

async function person(name: string): Promise<P> {
  const u = await createTestUser(name, { emailVerifiedAt: new Date() });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
}
const start = (p: P, place: string, body: Record<string, unknown>) =>
  call(claimPOST as H, 'POST', { token: p.token, id: place, body });
const confirm = (p: P, id: string, code: string) =>
  call(confirmPOST as H, 'POST', { token: p.token, id, body: { code } });
const lastCode = () => /(\d{3}) ?(\d{3})/.exec(mail.at(-1)!.subject)!.slice(1).join('');
const roomPost = (p: P, body: string) =>
  call(roomPostPOST as H, 'POST', { token: p.token, id: cafe, body: { reading: reading(), body } });

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  await db.appConfiguration.createMany({
    data: [
      { key: 'rateLimit.ownerClaim.perDay', value: 100 },
      { key: 'rateLimit.post.perMinute', value: 100 },
    ],
  });
  invalidateConfigCache();
  mail = [];
  setMailer({ send: async (m) => void mail.push(m) });
  await importServiceArea(db, readBoundaryFile());
  await importOsmPlaces(db, [
    {
      type: 'node',
      id: 1,
      lat: 30.315,
      lon: -81.686,
      tags: {
        amenity: 'cafe',
        name: 'Bold Bean',
        website: 'https://www.boldbean.com/menu',
        phone: '+1 904 555 0100',
      },
    },
    { type: 'node', id: 2, lat: 30.3152, lon: -81.6862, tags: { shop: 'gift', name: 'Tiny Shop' } },
  ]);
  cafe = (await db.businessPlace.findFirstOrThrow({ where: { name: 'Bold Bean' } })).id;
  shop = (await db.businessPlace.findFirstOrThrow({ where: { name: 'Tiny Shop' } })).id;
  ann = await person('ann_o');
  bob = await person('bob_o');
  admin = await adminHeaders((await createTestUser('mod_o', { role: 'ADMIN' })).id);
});
afterAll(() => setMailer(undefined));

describe('business email matching (D103)', () => {
  it.each([
    ['owner@boldbean.com', 'https://www.boldbean.com/menu', true],
    ['hi@mail.boldbean.com', 'https://boldbean.com', true],
    ['owner@gmail.com', 'https://boldbean.com', false],
    ['owner@boldbean.co', 'https://boldbean.com', false],
    ['owner@facebook.com', 'https://facebook.com/boldbean', false],
    ['not-an-email', 'https://boldbean.com', false],
  ])('%s for %s → %s', (email, site, ok) => {
    expect(emailMatchesWebsite(email, site)).toBe(ok);
  });
});

describe('verifying an owner (D103)', () => {
  it('business email: code → verified → Owner tag on their posts in that place only', async () => {
    expect(
      (await start(ann, cafe, { method: 'EMAIL', email: 'me@gmail.com' })).body.error.code,
    ).toBe('EMAIL_NOT_BUSINESS');
    const r = await start(ann, cafe, { method: 'EMAIL', email: 'owner@boldbean.com' });
    expect(r.status).toBe(201);
    expect(mail.at(-1)!.to).toBe('owner@boldbean.com');
    expect(JSON.stringify(await db.ownerClaim.findFirst())).not.toContain('owner@boldbean.com');
    expect((await confirm(ann, r.body.claim.id, '000000')).body.error.code).toBe('WRONG_CODE');
    // 🔒 Someone else can't use your claim, even with the right code.
    expect((await confirm(bob, r.body.claim.id, lastCode())).status).toBe(404);
    const ok = await confirm(ann, r.body.claim.id, lastCode());
    expect(ok.body.claim.status).toBe('VERIFIED');
    const post = await roomPost(ann, 'Fresh pastries today');
    // D185: a personal account posts as the person, even in their own place.
    expect(post.body.post.author.theOwner).toBeUndefined();
    const general = await call(postsPOST as H, 'POST', {
      token: ann.token,
      body: { reading: reading(), body: 'Nice evening' },
    });
    expect(general.body.post.author.theOwner).toBeUndefined(); // not in the area feed
    expect((await roomPost(bob, 'I love it here')).body.post.author.theOwner).toBeUndefined();
  });

  it('a second owner of the same place needs an admin', async () => {
    const a = await start(ann, cafe, { method: 'EMAIL', email: 'a@boldbean.com' });
    await confirm(ann, a.body.claim.id, lastCode());
    const b = await start(bob, cafe, { method: 'EMAIL', email: 'b@boldbean.com' });
    const r = await confirm(bob, b.body.claim.id, lastCode());
    expect(r.body.claim.status).toBe('PENDING');
    expect((await listOwnerClaims('PENDING')).rows.map((c) => c.id)).toContain(b.body.claim.id);
    await call(decidePOST as H, 'POST', {
      headers: admin,
      params: { id: b.body.claim.id },
      body: { action: 'approve' },
    });
    expect((await db.ownerClaim.findUniqueOrThrow({ where: { id: b.body.claim.id } })).status).toBe(
      'VERIFIED',
    );
  });

  it('website/social code: the admin checks the link; reject or approve', async () => {
    const r = await start(ann, shop, { method: 'WEBSITE' });
    expect(r.body.claim.publicCode).toMatch(/^JAX-[A-Z2-9]{6}$/);
    expect((await listOwnerClaims('PENDING')).rows).toEqual([]); // no link yet
    expect(
      (
        await call(proofPOST as H, 'POST', {
          token: ann.token,
          id: r.body.claim.id,
          body: { proofUrl: 'javascript:alert(1)' },
        })
      ).status,
    ).toBe(400);
    await call(proofPOST as H, 'POST', {
      token: ann.token,
      id: r.body.claim.id,
      body: { proofUrl: 'https://instagram.com/tinyshop' },
    });
    const [pending] = (await listOwnerClaims('PENDING')).rows;
    expect(pending).toMatchObject({ proofUrl: 'https://instagram.com/tinyshop' });
    await call(decidePOST as H, 'POST', {
      headers: admin,
      params: { id: r.body.claim.id },
      body: { action: 'reject', note: 'Code not found on the page' },
    });
    expect((await db.ownerClaim.findFirstOrThrow()).status).toBe('REJECTED');
  });

  it('phone: needs a number on file; the code the admin reads verifies', async () => {
    expect((await start(ann, shop, { method: 'PHONE' })).body.error.code).toBe('NO_PHONE');
    expect((await start(ann, shop, { method: 'EMAIL', email: 'x@tiny.com' })).body.error.code).toBe(
      'NO_WEBSITE',
    );
    const r = await start(ann, cafe, { method: 'PHONE' });
    const [forAdmin] = (await listOwnerClaims('PENDING')).rows;
    expect(forAdmin!.place.phone).toBe('+1 904 555 0100');
    // The app never sees the code; only the portal does.
    expect(JSON.stringify(r.body)).not.toContain(forAdmin!.phoneCode!);
    expect((await confirm(ann, r.body.claim.id, forAdmin!.phoneCode!)).body.claim.status).toBe(
      'VERIFIED',
    );
  });

  it('one open claim at a time; cancel to start over; the GET lists your claims', async () => {
    const r = await start(ann, cafe, { method: 'WEBSITE' });
    expect((await start(ann, cafe, { method: 'PHONE' })).body.error.code).toBe('CLAIM_OPEN');
    await call(cancelPOST as H, 'POST', { token: ann.token, id: r.body.claim.id, body: {} });
    expect((await start(ann, cafe, { method: 'PHONE' })).status).toBe(201);
    const mine = await call(claimsGET as H, 'GET', { token: ann.token, id: cafe });
    expect(mine.body.place).toMatchObject({
      name: 'Bold Bean',
      website: 'https://www.boldbean.com/menu',
    });
    expect(mine.body.claims.map((c: { status: string }) => c.status)).toEqual([
      'PENDING',
      'CANCELLED',
    ]);
  });

  it('expired codes and too many tries are refused', async () => {
    const r = await start(ann, cafe, { method: 'EMAIL', email: 'owner@boldbean.com' });
    for (let i = 0; i < 5; i++) await confirm(ann, r.body.claim.id, '000000');
    expect((await confirm(ann, r.body.claim.id, lastCode())).body.error.code).toBe(
      'TOO_MANY_TRIES',
    );
    await call(cancelPOST as H, 'POST', { token: ann.token, id: r.body.claim.id, body: {} });
    const r2 = await start(ann, cafe, { method: 'EMAIL', email: 'owner@boldbean.com' });
    await db.ownerClaim.update({
      where: { id: r2.body.claim.id },
      data: { codeExpiresAt: new Date(Date.now() - 1000) },
    });
    expect((await confirm(ann, r2.body.claim.id, lastCode())).body.error.code).toBe('CODE_EXPIRED');
  });

  it('an admin can take the Owner tag away', async () => {
    const r = await start(ann, cafe, { method: 'EMAIL', email: 'owner@boldbean.com' });
    await confirm(ann, r.body.claim.id, lastCode());
    await call(decidePOST as H, 'POST', {
      headers: admin,
      params: { id: r.body.claim.id },
      body: { action: 'revoke', note: 'Repeated promotions' },
    });
    expect((await roomPost(ann, 'still posting')).body.post.author.owner).toBeUndefined();
    expect(await db.adminAuditLog.count({ where: { action: 'OWNER_REVOKE' } })).toBe(1);
  });
});
