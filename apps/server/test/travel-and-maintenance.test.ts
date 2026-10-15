import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LocationReading } from '@jax/shared';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { runMaintenance } from '@/server/jobs/maintenance';
import { assertLocationEligible, type LocationActor } from '@/server/location/eligibility';
import { readBoundaryFile } from '@/server/location/boundary-file';
import { importServiceArea } from '@/server/location/service-area';
import { resetDb } from './db-helpers';
import { createTestUser } from './user-factory';

const DOWNTOWN = { latitude: 30.3322, longitude: -81.6557 };
const JAX_BEACH = { latitude: 30.2856, longitude: -81.3884 }; // ~26 km from downtown
const ATLANTA = { latitude: 33.749, longitude: -84.388 }; // ~470 km away
const T0 = new Date('2026-10-15T15:00:00Z');
const MIN = 60_000;

const at = (ms: number) => new Date(T0.getTime() + ms);
const reading = (
  p: { latitude: number; longitude: number },
  when: Date,
  accuracyMeters = 15,
): LocationReading => ({ ...p, accuracyMeters, timestamp: when.getTime() - 2_000 });

async function code(p: Promise<unknown>) {
  try {
    await p;
    return 'ALLOWED';
  } catch (e) {
    return (e as { code?: string }).code ?? 'THREW';
  }
}

let actor: LocationActor;
beforeEach(async () => {
  await resetDb();
  invalidateConfigCache();
  await importServiceArea(db, readBoundaryFile());
  actor = { kind: 'user', user: await createTestUser('traveler') };
});

const check = (p: { latitude: number; longitude: number }, when: Date, acc?: number) =>
  code(assertLocationEligible(actor, reading(p, when, acc), 'general.post', undefined, when));

describe('impossible travel (P2.6, D38)', () => {
  // 🔒 Downtown, then the beach 60 seconds later, is ~1,500 km/h.
  it('blocks an impossible jump, flags it, and pauses location features for 15 minutes', async () => {
    expect(await check(DOWNTOWN, at(0))).toBe('ALLOWED');
    expect(await check(JAX_BEACH, at(1 * MIN))).toBe('LOCATION_IMPOSSIBLE_TRAVEL');

    const flag = await db.locationFlag.findFirstOrThrow();
    expect(flag.kind).toBe('IMPOSSIBLE_TRAVEL');
    expect(flag.speedKmh).toBeGreaterThan(1000);
    expect(flag.restrictedUntil?.getTime()).toBe(at(16 * MIN).getTime());

    // Even a perfectly normal reading is refused during the pause...
    expect(await check(JAX_BEACH, at(5 * MIN))).toBe('LOCATION_RESTRICTED');
    // ...and allowed again after it ends.
    expect(await check(JAX_BEACH, at(17 * MIN))).toBe('ALLOWED');
  });

  it('a normal drive (downtown to the beach in 30 minutes) is not flagged', async () => {
    expect(await check(DOWNTOWN, at(0))).toBe('ALLOWED');
    expect(await check(JAX_BEACH, at(30 * MIN))).toBe('ALLOWED');
    expect(await db.locationFlag.count()).toBe(0);
  });

  it('fast but possible (26 km in 6 minutes) is allowed and flagged for admins only', async () => {
    expect(await check(DOWNTOWN, at(0))).toBe('ALLOWED');
    expect(await check(JAX_BEACH, at(6 * MIN))).toBe('ALLOWED');
    const flag = await db.locationFlag.findFirstOrThrow();
    expect(flag.kind).toBe('SUSPICIOUS_TRAVEL');
    expect(flag.restrictedUntil).toBeNull();
  });

  it('a real flight (Atlanta, then downtown 75 minutes later) is not blocked', async () => {
    expect(await check(ATLANTA, at(0))).toBe('LOCATION_OUTSIDE_AREA');
    expect(await check(DOWNTOWN, at(75 * MIN))).toBe('ALLOWED');
  });

  it('GPS jitter (300 m apart within a second, ±100 m accuracy) is ignored', async () => {
    expect(await check(DOWNTOWN, at(0), 100)).toBe('ALLOWED');
    const jitter = { latitude: DOWNTOWN.latitude + 0.0027, longitude: DOWNTOWN.longitude };
    expect(await check(jitter, at(1_000), 100)).toBe('ALLOWED');
    expect(await db.locationFlag.count()).toBe(0);
  });

  it('readings older than the 2-hour lookback are not compared', async () => {
    expect(await check(DOWNTOWN, at(0))).toBe('ALLOWED');
    // 3 hours later, 26 km away: no comparison, so no flag.
    expect(await check(JAX_BEACH, at(180 * MIN))).toBe('ALLOWED');
    expect(await db.locationFlag.count()).toBe(0);
  });

  it("another user's readings don't count against this user", async () => {
    const other: LocationActor = { kind: 'user', user: await createTestUser('someone') };
    await assertLocationEligible(other, reading(DOWNTOWN, at(0)), 'general.post', undefined, at(0));
    expect(await check(JAX_BEACH, at(1 * MIN))).toBe('ALLOWED');
  });

  it('mock-location readings are flagged for review', async () => {
    const r = { ...reading(DOWNTOWN, at(0)), mocked: true };
    expect(await code(assertLocationEligible(actor, r, 'general.post', undefined, at(0)))).toBe(
      'LOCATION_MOCKED',
    );
    expect((await db.locationFlag.findFirstOrThrow()).kind).toBe('MOCKED_LOCATION');
  });

  it('thresholds come from AppConfiguration', async () => {
    await db.appConfiguration.create({
      data: { key: 'location.travel.blockSpeedKmh', value: 100 },
    });
    invalidateConfigCache();
    expect(await check(DOWNTOWN, at(0))).toBe('ALLOWED');
    // 26 km in 6 minutes = ~260 km/h: now over the lowered block threshold.
    expect(await check(JAX_BEACH, at(6 * MIN))).toBe('LOCATION_IMPOSSIBLE_TRAVEL');
  });
});

describe('daily maintenance (P2.5, D14)', () => {
  const DAY = 86_400_000;
  const NOW = new Date('2026-12-01T09:00:00Z');
  const ago = (days: number) => new Date(NOW.getTime() - days * DAY);

  it('deletes only data past its retention period', async () => {
    const u = await createTestUser('keeper');
    const userActor: LocationActor = { kind: 'user', user: u };
    // Location checks 31 days old (delete) and 29 days old (keep).
    for (const when of [ago(31), ago(29)]) {
      await assertLocationEligible(
        userActor,
        reading(DOWNTOWN, when),
        'general.read',
        undefined,
        when,
      );
    }
    const hash = () => randomUUID().replace(/-/g, '').padEnd(64, '0');
    await db.session.createMany({
      data: [
        { userId: u.id, kind: 'MOBILE', tokenHash: hash(), expiresAt: ago(8) }, // delete
        { userId: u.id, kind: 'MOBILE', tokenHash: hash(), expiresAt: ago(3) }, // keep (recent)
        { userId: u.id, kind: 'MOBILE', tokenHash: hash(), expiresAt: ago(-20), revokedAt: ago(8) }, // delete
        { userId: u.id, kind: 'MOBILE', tokenHash: hash(), expiresAt: ago(-20) }, // keep (active)
      ],
    });
    await db.emailToken.createMany({
      data: [
        { userId: u.id, purpose: 'VERIFY_EMAIL', tokenHash: hash(), expiresAt: ago(10) }, // delete
        {
          userId: u.id,
          purpose: 'VERIFY_EMAIL',
          tokenHash: hash(),
          expiresAt: ago(-1),
          usedAt: ago(8),
        }, // delete
        { userId: u.id, purpose: 'PASSWORD_RESET', tokenHash: hash(), expiresAt: ago(-1) }, // keep
      ],
    });
    await db.rateLimitCounter.createMany({
      data: [
        { key: 'old', windowStart: ago(2), expiresAt: ago(1), count: 3 }, // delete
        { key: 'live', windowStart: NOW, expiresAt: ago(-1), count: 1 }, // keep
      ],
    });

    const report = await runMaintenance(NOW);
    expect(report).toMatchObject({
      locationChecks: 1,
      sessions: 2,
      emailTokens: 2,
      rateLimitCounters: 1,
    });
    expect(await db.locationCheck.count()).toBe(1);
    expect(await db.session.count()).toBe(2);
    expect(await db.emailToken.count()).toBe(1);
    expect(await db.rateLimitCounter.count()).toBe(1);

    // Running again removes nothing more.
    expect(await runMaintenance(NOW)).toMatchObject({
      locationChecks: 0,
      sessions: 0,
      emailTokens: 0,
      rateLimitCounters: 0,
    });
  });

  it('a second run waits its turn: it returns null while another run holds the lock', async () => {
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(4810001)`;
      expect(await runMaintenance(NOW)).toBeNull();
    });
  });
});
