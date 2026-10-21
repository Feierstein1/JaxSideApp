import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import type { LocationReading } from '@jax/shared';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import { Prisma } from '@/generated/prisma/client';
import { deleteInBatches } from '@/server/jobs/batch';
import { COUNTERS_LOCK_KEY, runCounterCleanup } from '@/server/jobs/counters';
import { MAINTENANCE_LOCK_KEY, runMaintenance } from '@/server/jobs/maintenance';

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

// D106: reads are checked but not recorded, and only writes feed the travel check.
describe('reads leave no location record (D106)', () => {
  const read = (p: { latitude: number; longitude: number }, when: Date, mocked = false) =>
    code(
      assertLocationEligible(
        actor,
        { ...reading(p, when), ...(mocked ? { mocked: true } : {}) },
        'general.read',
        undefined,
        when,
      ),
    );

  it('allowed and refused reads write no row; writes (allowed or refused) do', async () => {
    expect(await read(DOWNTOWN, at(0))).toBe('ALLOWED');
    expect(await read(ATLANTA, at(1 * MIN))).toBe('LOCATION_OUTSIDE_AREA'); // still refused
    expect(await db.locationCheck.count()).toBe(0);
    expect(await check(DOWNTOWN, at(2 * MIN))).toBe('ALLOWED');
    expect(await check(ATLANTA, at(3 * MIN))).not.toBe('ALLOWED');
    expect(
      (await db.locationCheck.findMany({ orderBy: { receivedAt: 'asc' } })).map((r) => r.result),
    ).toEqual(['ALLOWED', 'DENIED']);
  });

  it('reads never raise travel flags; the check compares a write with the previous write', async () => {
    expect(await read(DOWNTOWN, at(0))).toBe('ALLOWED');
    expect(await read(JAX_BEACH, at(1 * MIN))).toBe('ALLOWED'); // a jump, but only reading
    expect(await check(DOWNTOWN, at(2 * MIN))).toBe('ALLOWED'); // no earlier write to compare
    expect(await db.locationFlag.count()).toBe(0);
    expect(await check(JAX_BEACH, at(3 * MIN))).toBe('LOCATION_IMPOSSIBLE_TRAVEL');
  });

  it('a mocked location is refused for reads too, but only a write creates a flag', async () => {
    expect(await read(DOWNTOWN, at(0), true)).toBe('LOCATION_MOCKED');
    expect(await db.locationFlag.count()).toBe(0);
    expect(
      await code(
        assertLocationEligible(
          actor,
          { ...reading(DOWNTOWN, at(MIN)), mocked: true },
          'general.post',
          undefined,
          at(MIN),
        ),
      ),
    ).toBe('LOCATION_MOCKED');
    expect(await db.locationFlag.count()).toBe(1);
  });

  it('a travel pause blocks writes, not reading', async () => {
    await check(DOWNTOWN, at(0));
    expect(await check(JAX_BEACH, at(1 * MIN))).toBe('LOCATION_IMPOSSIBLE_TRAVEL');
    expect(await check(JAX_BEACH, at(5 * MIN))).toBe('LOCATION_RESTRICTED');
    expect(await read(JAX_BEACH, at(5 * MIN))).toBe('ALLOWED');
  });
});

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
        'general.post',

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

// P13.3 (DB review A6 / A7): batched deletes and the 10-minute counter cleanup.
describe('cleanup jobs at volume (P13.3)', () => {
  const T = new Date('2026-10-15T15:00:00Z');
  const counters = (n: number, expired: boolean) =>
    Array.from({ length: n }, (_, i) => ({
      key: `${expired ? 'old' : 'live'}-${i}`,
      windowStart: T,
      expiresAt: new Date(T.getTime() + (expired ? -60_000 : 60_000)),
      count: 1,
    }));

  it('deletes in batches until nothing matching is left, and nothing else', async () => {
    await db.rateLimitCounter.createMany({ data: [...counters(12, true), ...counters(3, false)] });
    const n = await deleteInBatches('RateLimitCounter', Prisma.sql`"expiresAt" < ${T}`, 5);
    expect(n).toBe(12); // batches of 5, 5, 2
    expect(await db.rateLimitCounter.count()).toBe(3);
  });

  it('the counter job removes expired counters and keeps live ones', async () => {
    await db.rateLimitCounter.createMany({ data: [...counters(4, true), ...counters(2, false)] });
    expect(await runCounterCleanup(T)).toBe(4);
    expect(await db.rateLimitCounter.count()).toBe(2);
    expect(await runCounterCleanup(T)).toBe(0);
  });

  it('each job has its own lock: one run at a time, but the two jobs don’t block each other', async () => {
    await db.rateLimitCounter.createMany({ data: counters(1, true) });
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${COUNTERS_LOCK_KEY})`;
      expect(await runCounterCleanup(T)).toBeNull();
      expect(await runMaintenance(T)).not.toBeNull(); // maintenance isn't held up
    });
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${MAINTENANCE_LOCK_KEY})`;
      expect(await runCounterCleanup(T)).toBe(0);
    });
    // The locks are released after each run.
    expect(await runMaintenance(T)).not.toBeNull();
    expect(await runCounterCleanup(T)).toBe(0);
  });
});
