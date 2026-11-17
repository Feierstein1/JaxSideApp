import { beforeEach, describe, expect, it } from 'vitest';
import { localDate } from '@jax/shared';
import { POST as actPOST } from '@/app/api/v1/admin/businesses/[id]/route';
import { POST as adminCreatePOST } from '@/app/api/v1/admin/events/route';
import { createSession } from '@/server/auth/sessions';
import { generateToken, hashToken } from '@/server/auth/crypto';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { ensureTiers } from '@/server/plan-tiers';
import { rollPlans } from '@/server/plans/lifecycle';
import { adminHeaders } from './admin-helpers';
import { relaxBurstLimits, resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

// D261: closing a business account from the admin portal, and the terms-acceptance columns.

const DAY = 86_400_000;
const CAFE = { latitude: 30.3276, longitude: -81.659 };

let admin: Record<string, string>;
let cafe: string;
let owner: string;
let sam: string;
let other: string;

const act = (id: string, body: object, headers = admin) =>
  call(actPOST as H, 'POST', { headers, params: { id }, body });
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
async function event(accountId: string, title: string) {
  const r = await call(adminCreatePOST as H, 'POST', {
    headers: admin,
    body: {
      title,
      description: 'A trio plays standards.',
      category: 'music',
      setting: 'indoor',
      free: true,
      hostKind: 'organizer',
      ...CAFE,
      sessions: [{ date: localDate(new Date(Date.now() + 3 * DAY)), start: '19:00', end: '22:00' }],
    },
  });
  expect(r.status, JSON.stringify(r.body)).toBe(201);
  await db.event.update({ where: { id: r.body.id }, data: { businessAccountId: accountId } });
  return r.body.id as string;
}
const ad = (accountId: string, status: 'APPROVED' | 'DRAFT' | 'ENDED') =>
  db.ad.create({
    data: {
      accountId,
      placeId: cafe,
      template: 'BANNER',
      headline: `Ad ${status}`,
      status,
      cityWide: true,
    },
  });

beforeEach(async () => {
  await resetDb();
  await relaxBurstLimits();
  await importServiceArea(db, readBoundaryFile());
  invalidateConfigCache();
  await ensureTiers(db);
  await importOsmPlaces(db, [
    {
      type: 'node',
      id: 1,
      lat: CAFE.latitude,
      lon: CAFE.longitude,
      tags: { amenity: 'cafe', name: 'Bold Bean' },
    },
  ]);
  cafe = (await db.businessPlace.findFirstOrThrow()).id;
  admin = await adminHeaders((await createTestUser('boss_c', { role: 'ADMIN' })).id);
  owner = (
    await db.businessAccount.create({
      data: { email: 'owner@boldbean.test', passwordHash: 'x', kind: 'BUSINESS' },
    })
  ).id;
  sam = (
    await db.businessAccount.create({
      data: { email: 'sam@boldbean.test', passwordHash: 'x', createdById: owner },
    })
  ).id;
  other = (
    await db.businessAccount.create({
      data: { email: 'other@else.test', passwordHash: 'x', kind: 'ORGANIZER' },
    })
  ).id;
  await db.businessPlaceAccess.createMany({
    data: [
      {
        accountId: owner,
        placeId: cafe,
        role: 'OWNER',
        verifiedBy: 'ADMIN',
        verifiedAt: new Date(),
      },
      { accountId: sam, placeId: cafe, role: 'STAFF', staffName: 'Sam' },
    ],
  });
  await db.businessTeamMember.createMany({
    data: [
      {
        ownerAccountId: owner,
        memberAccountId: sam,
        email: 'sam@boldbean.test',
        role: 'STAFF',
        displayName: 'Sam',
        acceptedAt: new Date(),
      },
      // An invite nobody accepted yet.
      {
        ownerAccountId: owner,
        email: 'new@boldbean.test',
        role: 'MANAGER',
        inviteTokenHash: hashToken(generateToken()),
        inviteExpiresAt: new Date(Date.now() + DAY),
      },
    ],
  });
  const standard = await db.plan.findUniqueOrThrow({ where: { code: 'STANDARD' } });
  for (const accountId of [owner, other]) {
    await db.subscription.create({
      data: {
        accountId,
        planId: standard.id,
        source: 'COMP',
        startsAt: new Date(Date.now() - DAY),
        endsAt: new Date(Date.now() + 5 * DAY),
      },
    });
  }
  await db.businessPost.create({
    data: { placeId: cafe, businessAuthorId: sam, body: 'Happy hour 4–7' },
  });
  await bizSession(owner);
  await bizSession(sam);
  await bizSession(other);
}, 60_000);

describe('closing a business account (D261)', () => {
  it('ends everything the business runs, keeps the place and its posts, without names', async () => {
    const live = await ad(owner, 'APPROVED');
    const draft = await ad(owner, 'DRAFT');
    const evt = await event(owner, 'Jazz night');
    const now = new Date();
    await db.boost.create({
      data: {
        accountId: owner,
        eventId: evt,
        days: 3,
        startsAt: now,
        endsAt: new Date(now.getTime() + 3 * DAY),
      },
    });
    await db.businessVerificationRequest.create({
      data: { accountId: owner, placeName: 'Bold Bean Two', contactName: 'Pat' },
    });
    const otherAd = await ad(other, 'APPROVED');
    const otherEvent = await event(other, 'Poetry slam');

    const r = await act(owner, { action: 'revoke', note: 'owner asked to close' });
    expect(r.status, JSON.stringify(r.body)).toBe(200);

    // Logins, sessions, team rows and invites.
    expect(
      await db.businessAccount.count({ where: { id: { in: [owner, sam] }, revokedAt: null } }),
    ).toBe(0);
    expect(
      await db.businessSession.count({
        where: { accountId: { in: [owner, sam] }, revokedAt: null },
      }),
    ).toBe(0);
    expect(
      await db.businessTeamMember.count({ where: { ownerAccountId: owner, revokedAt: null } }),
    ).toBe(0);
    expect(await db.businessTeamMember.count({ where: { inviteTokenHash: { not: null } } })).toBe(
      0,
    );
    // Plan, ads, events, boosts, requests.
    const sub = await db.subscription.findFirstOrThrow({ where: { accountId: owner } });
    expect(sub).toMatchObject({
      status: 'CANCELLED',
      cancelReason: 'Account closed: owner asked to close',
    });
    expect((await db.ad.findUniqueOrThrow({ where: { id: live.id } })).status).toBe('ENDED');
    expect((await db.ad.findUniqueOrThrow({ where: { id: draft.id } })).status).toBe('ENDED');
    expect((await db.event.findUniqueOrThrow({ where: { id: evt } })).status).toBe('REMOVED');
    expect((await db.boost.findFirstOrThrow({ where: { accountId: owner } })).status).toBe(
      'CANCELLED',
    );
    expect((await db.businessVerificationRequest.findFirstOrThrow()).status).toBe('CANCELLED');
    // The place stays (free for another owner) and posts stay, without the staff name.
    expect(await db.businessPlace.count({ where: { id: cafe } })).toBe(1);
    expect(await db.businessPlaceAccess.count({ where: { placeId: cafe, revokedAt: null } })).toBe(
      0,
    );
    expect(await db.businessPost.count({ where: { placeId: cafe } })).toBe(1);
    expect(await db.businessPlaceAccess.count({ where: { staffName: { not: null } } })).toBe(0);
    expect(await db.businessTeamMember.count({ where: { displayName: { not: null } } })).toBe(0);
    // Audited with what was closed.
    const log = await db.adminAuditLog.findFirstOrThrow({ where: { action: 'BUSINESS_REVOKE' } });
    expect(log.metadata).toMatchObject({
      logins: 2,
      plansEnded: 1,
      adsEnded: 2,
      eventsRemoved: 1,
      boostsStopped: 1,
      requestsCancelled: 1,
      note: 'owner asked to close',
    });

    // 🔒 Another business is untouched.
    expect((await db.ad.findUniqueOrThrow({ where: { id: otherAd.id } })).status).toBe('APPROVED');
    expect((await db.event.findUniqueOrThrow({ where: { id: otherEvent } })).status).toBe(
      'APPROVED',
    );
    expect((await db.subscription.findFirstOrThrow({ where: { accountId: other } })).status).toBe(
      'ACTIVE',
    );
    expect(await db.businessSession.count({ where: { accountId: other, revokedAt: null } })).toBe(
      1,
    );

    // The daily job never moves a closed business to Free.
    await rollPlans(new Date(Date.now() + 10 * DAY));
    expect(await db.subscription.count({ where: { accountId: owner } })).toBe(1);
    // Closed is final.
    expect((await act(owner, { action: 'unsuspend' })).status).toBe(409);
  });

  it('revoking one team login leaves the business open', async () => {
    const live = await ad(owner, 'APPROVED');
    expect((await act(sam, { action: 'revoke' })).status).toBe(200);
    expect(
      (await db.businessAccount.findUniqueOrThrow({ where: { id: owner } })).revokedAt,
    ).toBeNull();
    expect((await db.ad.findUniqueOrThrow({ where: { id: live.id } })).status).toBe('APPROVED');
    expect((await db.subscription.findFirstOrThrow({ where: { accountId: owner } })).status).toBe(
      'ACTIVE',
    );
    // Sam's team row ends; the open invite and the owner's session don't.
    expect(
      await db.businessTeamMember.count({ where: { memberAccountId: sam, revokedAt: null } }),
    ).toBe(0);
    expect(
      await db.businessTeamMember.count({ where: { email: 'new@boldbean.test', revokedAt: null } }),
    ).toBe(1);
    expect(await db.businessSession.count({ where: { accountId: owner, revokedAt: null } })).toBe(
      1,
    );
  });

  it('🔒 only an admin can close a business', async () => {
    const u = await createTestUser('ann_c', { emailVerifiedAt: new Date() });
    const token = (await createSession(u.id, 'MOBILE')).token;
    expect(
      (
        await call(actPOST as H, 'POST', {
          token,
          params: { id: owner },
          body: { action: 'revoke' },
        })
      ).status,
    ).toBe(401);
    expect((await act(owner, { action: 'revoke' }, {})).status).toBe(401);
    expect((await act(owner, { action: 'close-everything' })).status).toBe(400);
    expect(
      (await db.businessAccount.findUniqueOrThrow({ where: { id: owner } })).revokedAt,
    ).toBeNull();
  });
});

describe('terms acceptance (D261)', () => {
  it('stores when and which version, both or neither', async () => {
    await db.businessAccount.update({
      where: { id: other },
      data: { termsAcceptedAt: new Date(), termsVersion: '2026-11-16' },
    });
    await expect(
      db.businessAccount.update({ where: { id: owner }, data: { termsVersion: '2026-11-16' } }),
    ).rejects.toThrow(/BusinessAccount_terms_pair/);
    await expect(
      db.businessAccount.update({ where: { id: owner }, data: { termsAcceptedAt: new Date() } }),
    ).rejects.toThrow(/BusinessAccount_terms_pair/);
  });
});
