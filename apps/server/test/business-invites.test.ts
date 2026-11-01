import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { POST as decidePOST } from '@/app/api/v1/admin/owner-claims/[id]/route';
import { POST as invitePOST } from '@/app/api/v1/admin/owner-claims/[id]/business-invite/route';
import { POST as confirmPOST } from '@/app/api/v1/owner-claims/[id]/confirm/route';
import { POST as claimPOST } from '@/app/api/v1/places/[id]/owner-claims/route';
import { createSession } from '@/server/auth/sessions';
import { hashToken } from '@/server/auth/crypto';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { setMailer, type OutgoingMail } from '@/server/mail/mailer';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D172: a verified primary owner is emailed an invite to the business website.

type P = { id: string; token: string; email: string };
let ann: P;
let bob: P;
let cafe: string;
let admin: Record<string, string>;
let mail: OutgoingMail[];

async function person(name: string): Promise<P> {
  const email = `${name}@personal.test`;
  const u = await createTestUser(name, { email, emailVerifiedAt: new Date() });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token, email };
}
const lastCode = () => /(\d{3}) ?(\d{3})/.exec(mail.at(-1)!.subject)!.slice(1).join('');
const invitesTo = (to: string) =>
  mail.filter((m) => m.to === to && /JaxSide for Business/.test(m.subject));
const tokenIn = (m: OutgoingMail) => decodeURIComponent(/invite\?token=([^\s]+)/.exec(m.text)![1]!);

/** Business-email claim, code confirmed. */
async function verify(p: P, email: string) {
  const r = await call(claimPOST as H, 'POST', {
    token: p.token,
    id: cafe,
    body: { method: 'EMAIL', email },
  });
  const ok = await call(confirmPOST as H, 'POST', {
    token: p.token,
    id: r.body.claim.id,
    body: { code: lastCode() },
  });
  return ok.body.claim as { id: string; status: string };
}

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  await db.appConfiguration.create({ data: { key: 'rateLimit.ownerClaim.perDay', value: 100 } });
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
      tags: { amenity: 'cafe', name: 'Bold Bean', website: 'https://boldbean.com' },
    },
  ]);
  cafe = (await db.businessPlace.findFirstOrThrow({ where: { name: 'Bold Bean' } })).id;
  ann = await person('ann_i');
  bob = await person('bob_i');
  admin = await adminHeaders((await createTestUser('mod_i', { role: 'ADMIN' })).id);
});
afterAll(() => setMailer(undefined));

describe('business-site invites', () => {
  it('verifying the first owner emails an invite to their personal email', async () => {
    const claim = await verify(ann, 'owner@boldbean.com');
    expect(claim.status).toBe('VERIFIED');
    const [invite] = invitesTo(ann.email);
    expect(invite).toBeDefined();
    expect(invite!.text).toMatch(/^http:\/\/localhost:3100\/invite\?token=/m);
    expect(invite!.text).toContain('Bold Bean');
    // The business address used for the claim is not where the invite goes.
    expect(invitesTo('owner@boldbean.com')).toHaveLength(0);

    const row = await db.businessInvite.findFirstOrThrow();
    expect(row.ownerClaimId).toBe(claim.id);
    expect(row.placeId).toBe(cafe);
    expect(row.tokenHash).toBe(hashToken(tokenIn(invite!)));
    const days = (row.expiresAt.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThanOrEqual(7);
  });

  it('a second owner approved by an admin gets no invite (not the primary owner)', async () => {
    await verify(ann, 'a@boldbean.com');
    const second = await verify(bob, 'b@boldbean.com');
    expect(second.status).toBe('PENDING');
    await call(decidePOST as H, 'POST', {
      headers: admin,
      params: { id: second.id },
      body: { action: 'approve' },
    });
    expect(invitesTo(bob.email)).toHaveLength(0);
    const refused = await call(invitePOST as H, 'POST', {
      headers: admin,
      params: { id: second.id },
      body: {},
    });
    expect(refused.status).toBe(409);
  });

  it('an admin resend replaces the older link, and is admin-only', async () => {
    const claim = await verify(ann, 'owner@boldbean.com');
    const first = tokenIn(invitesTo(ann.email)[0]!);
    // 🔒 A phone-app session can't send invites.
    const asUser = await call(invitePOST as H, 'POST', {
      token: ann.token,
      params: { id: claim.id },
      body: {},
    });
    expect(asUser.status).toBe(401);
    const r = await call(invitePOST as H, 'POST', {
      headers: admin,
      params: { id: claim.id },
      body: {},
    });
    expect(r.status).toBe(200);
    expect(invitesTo(ann.email)).toHaveLength(2);
    const old = await db.businessInvite.findUniqueOrThrow({
      where: { tokenHash: hashToken(first) },
    });
    expect(old.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
    expect(await db.businessInvite.count({ where: { expiresAt: { gt: new Date() } } })).toBe(1);
    expect(
      (await db.adminAuditLog.findFirst({ where: { action: 'OWNER_BUSINESS_INVITE' } }))?.targetId,
    ).toBe(claim.id);
  });

  it('no invite once the place has an owner on the business site', async () => {
    const claim = await verify(ann, 'owner@boldbean.com');
    const acct = await db.businessAccount.create({
      data: { email: 'biz@boldbean.com', passwordHash: 'x' },
    });
    await db.businessPlaceAccess.create({
      data: { accountId: acct.id, placeId: cafe, role: 'OWNER', ownerClaimId: claim.id },
    });
    const r = await call(invitePOST as H, 'POST', {
      headers: admin,
      params: { id: claim.id },
      body: {},
    });
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/already has an owner/);
  });

  it('removing the Owner tag ends business-site access for the owner and their staff', async () => {
    const claim = await verify(ann, 'owner@boldbean.com');
    const owner = await db.businessAccount.create({
      data: { email: 'biz@boldbean.com', passwordHash: 'x' },
    });
    const staff = await db.businessAccount.create({
      data: { username: 'sam.bb', passwordHash: 'x', createdById: owner.id },
    });
    await db.businessPlaceAccess.createMany({
      data: [
        { accountId: owner.id, placeId: cafe, role: 'OWNER', ownerClaimId: claim.id },
        { accountId: staff.id, placeId: cafe, role: 'STAFF', grantedById: owner.id },
      ],
    });
    await call(decidePOST as H, 'POST', {
      headers: admin,
      params: { id: claim.id },
      body: { action: 'revoke' },
    });
    expect(await db.businessPlaceAccess.count({ where: { revokedAt: null } })).toBe(0);
    expect(await db.businessInvite.count({ where: { expiresAt: { gt: new Date() } } })).toBe(0);
  });
});
