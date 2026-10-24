import { beforeEach, describe, expect, it } from 'vitest';
import { GET as adminListGET } from '@/app/api/v1/admin/submissions/route';
import { POST as adminDecidePOST } from '@/app/api/v1/admin/submissions/[id]/route';
import { POST as adminBulkPOST } from '@/app/api/v1/admin/submissions/bulk/route';
import { GET as mySubmissionsGET } from '@/app/api/v1/me/submissions/route';
import { POST as searchPOST } from '@/app/api/v1/places/search/route';
import { POST as submitPOST } from '@/app/api/v1/submissions/route';
import { POST as checkPOST } from '@/app/api/v1/submissions/check/route';
import { createSession } from '@/server/auth/sessions';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { importOsmPlaces } from '@/server/directory/osm';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { invalidateScreeningCache } from '@/server/moderation/screening';
import { ACHIEVEMENTS } from '../prisma/seed-data';
import { adminHeaders } from './admin-helpers';
import { resetDb } from './db-helpers';
import { callRoute as call, type AnyHandler as H } from './route-call';
import { createTestUser } from './user-factory';

const HERE = { latitude: 30.3149, longitude: -81.6853 };
const OUTSIDE = { latitude: 30.1661, longitude: -81.7065 };
const reading = (p = HERE) => ({ ...p, accuracyMeters: 10, timestamp: Date.now() - 2_000 });
const DAY = 86_400_000;

let token: string;
let userId: string;
let admin: Record<string, string>;

const submit = (body: Record<string, unknown>, t = token, at = HERE) =>
  call(submitPOST as H, 'POST', { token: t, body: { reading: reading(at), ...body } });
const decide = (id: string, body: Record<string, unknown>) =>
  call(adminDecidePOST as H, 'POST', { headers: admin, params: { id }, body });

async function user(name: string, ageDays = 7) {
  const u = await createTestUser(name, {
    emailVerifiedAt: new Date(),
    createdAt: new Date(Date.now() - ageDays * DAY),
  });
  return { id: u.id, token: (await createSession(u.id, 'MOBILE')).token };
}

beforeEach(async () => {
  await resetDb();
  invalidateConfigCache();
  invalidateScreeningCache();
  await importServiceArea(db, readBoundaryFile());
  await importOsmPlaces(db, [
    {
      type: 'node',
      id: 1,
      lat: 30.3151,
      lon: -81.6851,
      tags: { amenity: 'cafe', name: 'Bold Bean Coffee' },
    },
  ]);
  const def = ACHIEVEMENTS.find((a) => a.key === 'approved_contributor')!;
  await db.achievement.create({
    data: {
      key: def.key,
      name: def.name,
      description: def.description,
      icon: def.icon,
      criteria: def.criteria,
    },
  });
  ({ id: userId, token } = await user('suggester_s'));
  admin = await adminHeaders((await createTestUser('admin_s', { role: 'ADMIN' })).id);
});

describe('suggesting a place (P5.8, P5.9, D63)', () => {
  it('shows likely duplicates before and after submitting', async () => {
    const c = await call(checkPOST as H, 'POST', {
      token,
      body: { reading: reading(), name: 'Bold Bean' },
    });
    expect(c.status).toBe(200);
    expect(c.body.places).toEqual([
      expect.objectContaining({ name: 'Bold Bean Coffee', category: 'cafe' }),
    ]);
    const r = await submit({
      name: 'Bold Bean Cafe',
      category: 'cafe',
      notes: 'Opened last month',
    });
    expect(r.status).toBe(201);
    expect(r.body.duplicates.places).toHaveLength(1);
    const unrelated = await call(checkPOST as H, 'POST', {
      token,
      body: { reading: reading(), name: 'Zebra Tire Shop' },
    });
    // Nothing named like it, but a place sits right on this spot? No: 20+ m away.
    expect(unrelated.body.places).toEqual([]);
  });

  it('the pin is the reading; the address is optional', async () => {
    await submit({ name: 'Riverside Tacos', category: 'restaurant' });
    const s = await db.businessSubmission.findFirstOrThrow();
    expect(s).toMatchObject({
      latitude: HERE.latitude,
      longitude: HERE.longitude,
      address: null,
      submitterId: userId,
      status: 'PENDING',
    });
  });

  // 🔒 negative cases
  it('refuses outside Duval, unknown categories, smuggled fields, guests of other kinds', async () => {
    expect((await submit({ name: 'Clay Place', category: 'cafe' }, token, OUTSIDE)).status).toBe(
      403,
    );
    expect((await submit({ name: 'Odd Place', category: 'spaceport' })).status).toBe(400);
    expect((await submit({ name: 'Odd Place', category: 'cafe', status: 'APPROVED' })).status).toBe(
      400,
    );
    expect(await db.businessSubmission.count()).toBe(0);
  });

  it('risk limits: new accounts wait a day; daily cap; no duplicate pending suggestion', async () => {
    const fresh = await user('fresh_s', 0);
    const r = await submit({ name: 'New Spot', category: 'cafe' }, fresh.token);
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('ACCOUNT_TOO_NEW');

    expect((await submit({ name: 'Taco Town', category: 'restaurant' })).status).toBe(201);
    const again = await submit({ name: 'Taco  town!', category: 'restaurant' });
    expect(again.body.error.code).toBe('ALREADY_SUGGESTED');
    const codes = [];
    for (let i = 0; i < 5; i++)
      codes.push((await submit({ name: `Spot ${i}`, category: 'park' })).status);
    expect(codes.at(-1)).toBe(429); // 5 per day, and 2 were already counted
  });

  it('names and notes are screened', async () => {
    await db.screeningRule.create({
      data: { term: 'kill you', action: 'BLOCK', category: 'THREAT' },
    });
    invalidateScreeningCache();
    expect((await submit({ name: 'Kill You Bar', category: 'bar' })).status).toBe(422);
  });

  // ✅D3: never searchable until approved.
  it('a pending suggestion is not in the directory', async () => {
    await submit({ name: 'Hidden Gem Diner', category: 'restaurant' });
    const s = await call(searchPOST as H, 'POST', {
      token,
      body: { reading: reading(), q: 'hidden gem' },
    });
    expect(s.body.places).toEqual([]);
  });
});

describe('the admin queue (P5.12, P5.13)', () => {
  it('lists pending suggestions with duplicates and submitter history', async () => {
    await submit({ name: 'Bold Bean', category: 'cafe' });
    const r = await call(adminListGET as H, 'GET', { headers: admin });
    expect(r.status).toBe(200);
    expect(r.body.submissions[0]).toMatchObject({
      name: 'Bold Bean',
      submitter: { username: 'suggester_s' },
      duplicates: { places: [expect.objectContaining({ name: 'Bold Bean Coffee' })] },
    });
    expect(r.body.history[userId]).toEqual({ PENDING: 1 });
    const filtered = await call(adminListGET as H, 'GET', {
      headers: admin,
      query: { category: 'park' },
    });
    expect(filtered.body.submissions).toEqual([]);
  });

  it('approve (with a correction): one place, searchable, one badge, audited', async () => {
    const id = (await submit({ name: 'Mandarin Market', category: 'shop' })).body.id;
    const r = await decide(id, {
      decision: 'approve',
      name: 'Mandarin Farmers Market',
      category: 'market',
    });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'APPROVED', badge: true });
    const place = await db.businessPlace.findUniqueOrThrow({ where: { id: r.body.placeId } });
    expect(place).toMatchObject({
      name: 'Mandarin Farmers Market',
      category: 'market',
      sourceName: 'community',
      status: 'ACTIVE',
    });
    const s = await call(searchPOST as H, 'POST', {
      token,
      body: { reading: reading(), q: 'mandarin' },
    });
    expect(s.body.places.map((p: { name: string }) => p.name)).toEqual(['Mandarin Farmers Market']);
    expect(await db.userAchievement.count({ where: { userId } })).toBe(1);
    expect(await db.adminAuditLog.count({ where: { action: 'SUBMISSION_APPROVED' } })).toBe(1);
    const mine = await call(mySubmissionsGET as H, 'GET', { token });
    expect(mine.body.submissions[0]).toMatchObject({ status: 'APPROVED', placeId: place.id });
  });

  // 🔒 ✅D5: double-click or two admins: exactly one place and one badge.
  it('approving twice at once creates one place and one badge', async () => {
    const id = (await submit({ name: 'Twin Oaks Deli', category: 'restaurant' })).body.id;
    const [a, b] = await Promise.all([
      decide(id, { decision: 'approve' }),
      decide(id, { decision: 'approve' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await db.businessPlace.count({ where: { sourceName: 'community' } })).toBe(1);
    expect(await db.userAchievement.count()).toBe(1);
    // A second approved suggestion doesn't award the badge again.
    const id2 = (await submit({ name: 'Second Spot Grill', category: 'restaurant' })).body.id;
    expect((await decide(id2, { decision: 'approve' })).body.badge).toBe(false);
    expect(await db.userAchievement.count()).toBe(1);
  });

  it('reject needs a reason, which the submitter sees; they can suggest again', async () => {
    const id = (await submit({ name: 'Fake Place', category: 'shop' })).body.id;
    expect((await decide(id, { decision: 'reject' })).status).toBe(400);
    expect((await decide(id, { decision: 'reject', reason: 'Couldn’t find it' })).status).toBe(200);
    const mine = await call(mySubmissionsGET as H, 'GET', { token });
    expect(mine.body.submissions[0]).toMatchObject({
      status: 'REJECTED',
      decisionReason: 'Couldn’t find it',
    });
    expect(await db.userAchievement.count()).toBe(0);
    expect(
      (await submit({ name: 'Fake Place', category: 'shop', notes: 'It is on Main St' })).status,
    ).toBe(201);
  });

  it('merge into an existing place: no new place, no badge', async () => {
    const id = (await submit({ name: 'Bold Bean', category: 'cafe' })).body.id;
    const existing = await db.businessPlace.findFirstOrThrow();
    const r = await decide(id, { decision: 'merge', placeId: existing.id });
    expect(r.body).toMatchObject({ status: 'MERGED', placeId: existing.id, badge: false });
    expect(await db.businessPlace.count()).toBe(1);
  });

  it('bulk approve and reject; already-decided items are reported, not fatal', async () => {
    const ids = [];
    for (const n of ['Alpha Cafe', 'Bravo Bar', 'Charlie Park']) {
      ids.push((await submit({ name: n, category: 'cafe' })).body.id);
    }
    await decide(ids[0]!, { decision: 'reject', reason: 'dup' });
    const r = await call(adminBulkPOST as H, 'POST', {
      headers: admin,
      body: { decision: 'approve', ids },
    });
    expect(r.body.results.map((x: { ok: boolean }) => x.ok)).toEqual([false, true, true]);
    expect(await db.businessPlace.count({ where: { sourceName: 'community' } })).toBe(2);
    const noReason = await call(adminBulkPOST as H, 'POST', {
      headers: admin,
      body: { decision: 'reject', ids },
    });
    expect(noReason.status).toBe(400);
  });

  // Phase 5 gate: one admin can clear 50 suggestions quickly.
  it('50 seeded suggestions are cleared in one bulk action', async () => {
    const ids = [];
    for (let i = 0; i < 50; i++) {
      const [row] = await db.$queryRaw<{ id: string }[]>`
        INSERT INTO "BusinessSubmission" (id, "submitterId", name, "nameNormalized", category,
          latitude, longitude, location, "updatedAt")
        VALUES (gen_random_uuid(), ${userId}::uuid, ${`Seeded Place ${i}`}, ${`seeded place ${i}`}, 'shop',
          ${HERE.latitude + i * 0.001}, ${HERE.longitude},
          ST_SetSRID(ST_MakePoint(${HERE.longitude}, ${HERE.latitude + i * 0.001}), 4326)::geography, now())
        RETURNING id`;
      ids.push(row!.id);
    }
    const list = await call(adminListGET as H, 'GET', { headers: admin });
    expect(list.body.submissions).toHaveLength(50);
    const started = Date.now();
    const r = await call(adminBulkPOST as H, 'POST', {
      headers: admin,
      body: { decision: 'approve', ids },
    });
    expect(r.body.results.every((x: { ok: boolean }) => x.ok)).toBe(true);
    const took = Date.now() - started;
    expect(took).toBeLessThan(20_000);
    expect(await db.businessSubmission.count({ where: { status: 'PENDING' } })).toBe(0);
  }, 30_000);
});
