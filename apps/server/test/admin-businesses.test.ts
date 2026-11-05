import { beforeEach, describe, expect, it } from 'vitest';
import { POST as ownerPOST } from '@/app/api/v1/admin/businesses/places/[id]/owner/route';
import { POST as actPOST } from '@/app/api/v1/admin/businesses/[id]/route';
import { getBusiness, listBusinesses } from '@/server/admin/businesses';
import { createSession } from '@/server/auth/sessions';
import { generateToken, hashToken, verifyPassword } from '@/server/auth/crypto';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// B1.7 / D172: the admin portal's Businesses section.

let admin: Record<string, string>;
let cafe: string;
let bar: string;
let owner: { id: string };
let sam: { id: string };
let appUser: { id: string; token: string };

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
const liveSessions = () => db.businessSession.count({ where: { revokedAt: null } });
const act = (id: string, body: object, headers = admin) =>
  call(actPOST as H, 'POST', { headers, params: { id }, body });

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  await importServiceArea(db, readBoundaryFile());
  await importOsmPlaces(db, [
    {
      type: 'node',
      id: 1,
      lat: 30.315,
      lon: -81.686,
      tags: { amenity: 'cafe', name: 'Bold Bean' },
    },
    { type: 'node', id: 2, lat: 30.316, lon: -81.687, tags: { amenity: 'bar', name: 'Night Owl' } },
  ]);
  cafe = (await db.businessPlace.findFirstOrThrow({ where: { name: 'Bold Bean' } })).id;
  bar = (await db.businessPlace.findFirstOrThrow({ where: { name: 'Night Owl' } })).id;
  admin = await adminHeaders((await createTestUser('mod_b', { role: 'ADMIN' })).id);
  const u = await createTestUser('ann_b', { emailVerifiedAt: new Date() });
  appUser = { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
  const claim = await db.ownerClaim.create({
    data: { placeId: cafe, userId: u.id, method: 'EMAIL', status: 'VERIFIED', primary: true },
  });
  owner = await db.businessAccount.create({
    data: { email: 'owner@boldbean.com', passwordHash: 'x' },
  });
  sam = await db.businessAccount.create({
    data: { username: 'sam.bb', passwordHash: 'x', createdById: owner.id },
  });
  await db.businessPlaceAccess.createMany({
    data: [
      { accountId: owner.id, placeId: cafe, role: 'OWNER', ownerClaimId: claim.id },
      { accountId: sam.id, placeId: cafe, role: 'STAFF', staffName: 'Sam' },
    ],
  });
  await db.businessPost.create({
    data: { placeId: cafe, businessAuthorId: sam.id, body: 'Happy hour 4–7' },
  });
  await bizSession(owner.id);
  await bizSession(sam.id);
});

describe('B1.7 Businesses section', () => {
  it('lists owner accounts with their places, and searches by email or place', async () => {
    const all = (await listBusinesses('')).rows;
    expect(all).toHaveLength(1); // staff logins are on the owner's page, not here
    expect(all[0]).toMatchObject({
      email: 'owner@boldbean.com',
      status: 'ACTIVE',
      employees: 1,
      places: [{ name: 'Bold Bean', role: 'OWNER' }],
    });
    expect((await listBusinesses('bold')).rows).toHaveLength(1);
    expect((await listBusinesses('boldbean.com')).rows).toHaveLength(1);
    expect((await listBusinesses('night owl')).rows).toHaveLength(0);
  });

  it('shows the claim behind each place, the team and what the business wrote', async () => {
    const b = await getBusiness(owner.id);
    expect(b.kind).toBe('owner');
    expect(b.places[0]!.claim?.appUser).toMatchObject({ id: appUser.id, username: 'ann_b' });
    expect(b.team).toEqual([
      expect.objectContaining({
        username: 'sam.bb',
        status: 'ACTIVE',
        places: [{ name: 'Bold Bean', role: 'STAFF', staffName: 'Sam' }],
      }),
    ]);
    expect(b.activity.posts30).toBe(1);
    expect(b.activity.recent[0]).toMatchObject({ kind: 'post', by: 'sam.bb', place: 'Bold Bean' });
    expect(b.activeSessions).toBe(2);
    const staffPage = await getBusiness(sam.id);
    expect(staffPage).toMatchObject({ kind: 'employee', owner: { id: owner.id } });
  });

  it('🔒 only an admin session can act (a phone-app token is refused)', async () => {
    expect(
      (
        await call(actPOST as H, 'POST', {
          token: appUser.token,
          params: { id: owner.id },
          body: { action: 'suspend' },
        })
      ).status,
    ).toBe(401);
    expect((await act(owner.id, { action: 'suspend', extra: 1 })).status).toBe(400);
    expect(
      (await db.businessAccount.findUniqueOrThrow({ where: { id: owner.id } })).suspendedAt,
    ).toBeNull();
  });

  it('suspending an owner covers the whole business; lifting it brings them back', async () => {
    expect((await act(owner.id, { action: 'suspend', note: 'spam replies' })).status).toBe(200);
    const after = await db.businessAccount.findMany({ orderBy: { createdAt: 'asc' } });
    expect(after.every((a) => a.suspendedAt !== null)).toBe(true);
    expect(await liveSessions()).toBe(0);
    const log = await db.adminAuditLog.findFirstOrThrow({ where: { action: 'BUSINESS_SUSPEND' } });
    expect(log).toMatchObject({ targetType: 'business-account', targetId: owner.id });
    expect(log.metadata).toMatchObject({ logins: 2, note: 'spam replies' });

    await act(owner.id, { action: 'unsuspend' });
    expect(await db.businessAccount.count({ where: { suspendedAt: { not: null } } })).toBe(0);
  });

  it('suspending one staff login leaves the owner alone', async () => {
    await act(sam.id, { action: 'suspend' });
    expect(
      (await db.businessAccount.findUniqueOrThrow({ where: { id: owner.id } })).suspendedAt,
    ).toBeNull();
    expect(
      (await db.businessAccount.findUniqueOrThrow({ where: { id: sam.id } })).suspendedAt,
    ).not.toBeNull();
  });

  it('revoking is permanent: logins, places and sessions all end', async () => {
    await act(owner.id, { action: 'revoke' });
    expect(await db.businessAccount.count({ where: { revokedAt: null } })).toBe(0);
    expect(await db.businessPlaceAccess.count({ where: { revokedAt: null } })).toBe(0);
    expect(await liveSessions()).toBe(0);
    expect((await act(owner.id, { action: 'unsuspend' })).status).toBe(409);
  });

  it('a password reset gives a temporary password that works, and signs that login out', async () => {
    await db.businessAccount.update({
      where: { id: sam.id },
      data: {
        totpEnabledAt: new Date(),
        totpSecretEnc: 'x',
        lockedUntil: new Date(Date.now() + 60_000),
      },
    });
    const r = await act(sam.id, { action: 'reset-password' });
    expect(r.status).toBe(200);
    const temp = r.body.temporaryPassword as string;
    expect(temp).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
    const row = await db.businessAccount.findUniqueOrThrow({ where: { id: sam.id } });
    expect(await verifyPassword(row.passwordHash, temp)).toBe(true);
    expect(row).toMatchObject({ mustChangePassword: true, totpEnabledAt: null, lockedUntil: null });
    expect(await db.businessSession.count({ where: { accountId: sam.id, revokedAt: null } })).toBe(
      0,
    );
    expect(
      await db.businessSession.count({ where: { accountId: owner.id, revokedAt: null } }),
    ).toBe(1);
    const log = await db.adminAuditLog.findFirstOrThrow({
      where: { action: 'BUSINESS_RESET_PASSWORD' },
    });
    expect(JSON.stringify(log.metadata)).not.toContain(temp); // never in the log
  });

  it('moves a place to another owner account, with or without the old staff', async () => {
    const buyer = await db.businessAccount.create({
      data: { email: 'buyer@example.com', passwordHash: 'x' },
    });
    const move = (body: object) =>
      call(ownerPOST as H, 'POST', { headers: admin, params: { id: cafe }, body });
    expect((await move({ toEmail: 'nobody@example.com', removeOldTeam: true })).status).toBe(404);
    // Not to a staff login.
    await db.businessAccount.update({ where: { id: sam.id }, data: { email: 'sam@x.com' } });
    expect((await move({ toEmail: 'sam@x.com', removeOldTeam: true })).status).toBe(404);

    expect((await move({ toEmail: 'Buyer@Example.com', removeOldTeam: true })).status).toBe(200);
    const live = await db.businessPlaceAccess.findMany({
      where: { placeId: cafe, revokedAt: null },
    });
    expect(live.map((a) => [a.accountId, a.role])).toEqual([[buyer.id, 'OWNER']]);
    expect((await move({ toEmail: 'buyer@example.com', removeOldTeam: true })).status).toBe(409);
    expect(await db.adminAuditLog.count({ where: { action: 'BUSINESS_MOVE_OWNER' } })).toBe(1);
    // B1.8: both businesses are told in their inbox.
    const notices = await db.businessNotice.findMany({ orderBy: { createdAt: 'asc' } });
    expect(notices.map((n) => [n.accountId, n.kind])).toEqual([
      [buyer.id, 'PLACE_ADDED'],
      [owner.id, 'PLACE_REMOVED'],
    ]);
    expect(notices[0]!.link).toBe(`/places/${cafe}`);

    // Keeping the old staff: they stay on the place under the new owner.
    await db.businessPlaceAccess.create({
      data: { accountId: owner.id, placeId: bar, role: 'OWNER' },
    });
    await db.businessPlaceAccess.create({
      data: { accountId: sam.id, placeId: bar, role: 'STAFF' },
    });
    await call(ownerPOST as H, 'POST', {
      headers: admin,
      params: { id: bar },
      body: { toEmail: 'buyer@example.com', removeOldTeam: false },
    });
    const barLive = await db.businessPlaceAccess.findMany({
      where: { placeId: bar, revokedAt: null },
    });
    expect(barLive.map((a) => a.accountId).sort()).toEqual([buyer.id, sam.id].sort());
  });
});
