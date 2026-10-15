import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { locationReadingSchema, type LocationReading } from '@jax/shared';
import { invalidateConfigCache } from '@/server/config';
import { db } from '@/server/db';
import {
  assertLocationEligible,
  coarsenPoint,
  type LocationActor,
} from '@/server/location/eligibility';
import {
  importServiceArea,
  isInServiceArea,
  readBoundaryFile,
} from '@/server/location/service-area';
import { resetDb } from './db-helpers';
import { createTestUser } from './user-factory';

// Reference points (checked against the TIGER2026 boundary).
const P = {
  downtown: { latitude: 30.3322, longitude: -81.6557 },
  jaxBeachPier: { latitude: 30.2856, longitude: -81.3884 },
  atlanticBeach: { latitude: 30.3344, longitude: -81.3987 },
  baldwin: { latitude: 30.3027, longitude: -81.9751 },
  orangePark: { latitude: 30.1661, longitude: -81.7065 }, // Clay County, ~1 mi outside
  ponteVedra: { latitude: 30.2397, longitude: -81.3856 }, // St Johns County, ~0.9 mi outside
  fernandina: { latitude: 30.6697, longitude: -81.4626 }, // Nassau County
  atlanta: { latitude: 33.749, longitude: -84.388 },
  offshore: { latitude: 30.33, longitude: -81.0 },
  fivePointsCoffee: { latitude: 30.3149, longitude: -81.6853 },
  memorialPark: { latitude: 30.3088, longitude: -81.6823 }, // 735 m from Five Points Coffee
};

const NOW = new Date('2026-10-15T15:00:00Z');

function reading(
  at: { latitude: number; longitude: number },
  overrides: Partial<LocationReading> = {},
): LocationReading {
  return { ...at, accuracyMeters: 15, timestamp: NOW.getTime() - 5_000, ...overrides };
}

let userActor: LocationActor;

beforeEach(async () => {
  await resetDb();
  invalidateConfigCache();
  await importServiceArea(db, readBoundaryFile());
  const u = await createTestUser('Rover');
  userActor = { kind: 'user', user: u };
});

async function denialCode(p: Promise<unknown>): Promise<string | null> {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? 'THREW';
  }
}

// ─────────────────────── Boundary (P2.2, D15, L1) ───────────────────────

describe('service area boundary', () => {
  it('importing twice keeps one row (idempotent)', async () => {
    await importServiceArea(db, readBoundaryFile());
    expect(await db.serviceArea.count()).toBe(1);
  });

  it.each([
    ['downtown', P.downtown],
    ['Jacksonville Beach pier (D15)', P.jaxBeachPier],
    ['Atlantic Beach (D15)', P.atlanticBeach],
    ['Baldwin (D15)', P.baldwin],
  ])('%s is inside', async (_l, p) => {
    expect(await isInServiceArea(db, p.latitude, p.longitude)).toBe(true);
  });

  it.each([
    ['Orange Park, Clay County', P.orangePark],
    ['Ponte Vedra Beach, St Johns County', P.ponteVedra],
    ['Fernandina Beach, Nassau County', P.fernandina],
    ['Atlanta', P.atlanta],
    ['30 km offshore', P.offshore],
  ])('%s is outside', async (_l, p) => {
    expect(await isInServiceArea(db, p.latitude, p.longitude)).toBe(false);
  });

  it('a point exactly on the boundary line counts as inside', async () => {
    const f = readBoundaryFile();
    const [lng, lat] = (f.geometry.coordinates as number[][][])[0]![0]!;
    expect(await isInServiceArea(db, lat!, lng!)).toBe(true);
  });

  it('an inactive service area admits nobody', async () => {
    await db.serviceArea.updateMany({ data: { active: false } });
    expect(await isInServiceArea(db, P.downtown.latitude, P.downtown.longitude)).toBe(false);
  });
});

// ─────────────────────── assertLocationEligible (P2.3, P2.4) ───────────────────────

describe('assertLocationEligible', () => {
  // L3: valid user in radius → allowed
  it('allows a fresh, accurate reading inside Duval for a general post', async () => {
    const r = await assertLocationEligible(
      userActor,
      reading(P.downtown),
      'general.post',
      undefined,
      NOW,
    );
    expect(r).toMatchObject(P.downtown);
  });

  // L1: outside the boundary → cannot post or vote
  it.each([
    ['general.post', P.orangePark],
    ['general.post', P.atlanta],
    ['general.vote', P.ponteVedra],
    ['general.read', P.fernandina],
  ] as const)('denies %s from outside Duval (L1, D16)', async (action, at) => {
    const target = action === 'general.vote' ? { kind: 'general' as const, point: at } : undefined;
    expect(
      await denialCode(assertLocationEligible(userActor, reading(at), action, target, NOW)),
    ).toBe('LOCATION_OUTSIDE_AREA');
  });

  // L2: inside Jacksonville but outside the radius → blocked
  it('business room: 735 m away is too far (0.3 mi = 483 m) (L2, D19)', async () => {
    const target = { kind: 'business' as const, point: P.fivePointsCoffee };
    expect(
      await denialCode(
        assertLocationEligible(userActor, reading(P.memorialPark), 'business.post', target, NOW),
      ),
    ).toBe('LOCATION_TOO_FAR');
    // ...and standing at the place is fine.
    await expect(
      assertLocationEligible(userActor, reading(P.fivePointsCoffee), 'business.post', target, NOW),
    ).resolves.toBeDefined();
  });

  it('general comment: within 1 mi of the post is allowed, beyond is denied (D20)', async () => {
    const post = { kind: 'general' as const, point: P.fivePointsCoffee };
    // 735 m away: allowed for a general post.
    await expect(
      assertLocationEligible(userActor, reading(P.memorialPark), 'general.comment', post, NOW),
    ).resolves.toBeDefined();
    // Downtown is ~2.7 km from Five Points: denied.
    expect(
      await denialCode(
        assertLocationEligible(userActor, reading(P.downtown), 'general.comment', post, NOW),
      ),
    ).toBe('LOCATION_TOO_FAR');
  });

  it('radius limits come from AppConfiguration', async () => {
    await db.appConfiguration.create({ data: { key: 'radius.business.maxMiles', value: 0.5 } });
    invalidateConfigCache();
    const target = { kind: 'business' as const, point: P.fivePointsCoffee };
    await expect(
      assertLocationEligible(userActor, reading(P.memorialPark), 'business.post', target, NOW),
    ).resolves.toBeDefined();
  });

  // L4: stale, malformed, or inaccurate readings rejected
  describe('reading quality (L4)', () => {
    it('denies a reading older than 60 s; allows 59 s', async () => {
      const stale = reading(P.downtown, { timestamp: NOW.getTime() - 61_000 });
      expect(
        await denialCode(assertLocationEligible(userActor, stale, 'general.post', undefined, NOW)),
      ).toBe('LOCATION_STALE');
      const fresh = reading(P.downtown, { timestamp: NOW.getTime() - 59_000 });
      await expect(
        assertLocationEligible(userActor, fresh, 'general.post', undefined, NOW),
      ).resolves.toBeDefined();
    });

    it('denies a reading from the future beyond 30 s of clock skew; allows 20 s', async () => {
      const ahead = reading(P.downtown, { timestamp: NOW.getTime() + 31_000 });
      expect(
        await denialCode(assertLocationEligible(userActor, ahead, 'general.post', undefined, NOW)),
      ).toBe('LOCATION_CLOCK_SKEW');
      const slightlyAhead = reading(P.downtown, { timestamp: NOW.getTime() + 20_000 });
      await expect(
        assertLocationEligible(userActor, slightlyAhead, 'general.post', undefined, NOW),
      ).resolves.toBeDefined();
    });

    it('denies accuracy worse than 100 m; allows exactly 100 m', async () => {
      const fuzzy = reading(P.downtown, { accuracyMeters: 101 });
      expect(
        await denialCode(assertLocationEligible(userActor, fuzzy, 'general.post', undefined, NOW)),
      ).toBe('LOCATION_INACCURATE');
      await expect(
        assertLocationEligible(
          userActor,
          reading(P.downtown, { accuracyMeters: 100 }),
          'general.post',
          undefined,
          NOW,
        ),
      ).resolves.toBeDefined();
    });

    it('denies readings flagged as mocked (Android mock-location apps)', async () => {
      const mocked = reading(P.downtown, { mocked: true });
      expect(
        await denialCode(assertLocationEligible(userActor, mocked, 'general.post', undefined, NOW)),
      ).toBe('LOCATION_MOCKED');
    });

    it.each([
      ['latitude out of range', { latitude: 91 }],
      ['longitude out of range', { longitude: -181 }],
      ['latitude as a string', { latitude: '30.33' }],
      ['NaN', { latitude: Number.NaN }],
      ['Infinity', { longitude: Number.POSITIVE_INFINITY }],
      ['zero accuracy', { accuracyMeters: 0 }],
      ['negative accuracy', { accuracyMeters: -5 }],
      ['missing timestamp', { timestamp: undefined }],
      ['fractional timestamp', { timestamp: 1.5 }],
      ['unexpected field', { userId: 'someone-else' }],
    ])('schema rejects a malformed reading: %s', (_l, patch) => {
      const r = { ...reading(P.downtown), ...patch } as Record<string, unknown>;
      if (patch && 'timestamp' in patch && patch.timestamp === undefined) delete r.timestamp;
      expect(locationReadingSchema.safeParse(r).success).toBe(false);
    });
  });

  describe('actor permissions (§5, D28)', () => {
    async function realGuest(): Promise<LocationActor> {
      const inst = await db.installation.create({ data: {} });
      const g = await db.guestSession.create({
        data: {
          tokenHash: randomUUID().replace(/-/g, '').padEnd(64, '0'),
          installationId: inst.id,
          expiresAt: new Date(NOW.getTime() + 86_400_000),
        },
      });
      return { kind: 'guest', guest: g };
    }

    it.each(['general.post', 'general.vote', 'business.read', 'business.post'] as const)(
      'guests cannot %s',
      async (action) => {
        const guest = await realGuest();
        const target = action.startsWith('business')
          ? { kind: 'business' as const, point: P.downtown }
          : action === 'general.vote'
            ? { kind: 'general' as const, point: P.downtown }
            : undefined;
        expect(
          await denialCode(assertLocationEligible(guest, reading(P.downtown), action, target, NOW)),
        ).toBe('ACTION_NOT_ALLOWED');
      },
    );

    it('guests can comment on a nearby general post, and the check is audited to the guest', async () => {
      const guest = await realGuest();
      const post = { kind: 'general' as const, point: P.downtown };
      await expect(
        assertLocationEligible(guest, reading(P.downtown), 'general.comment', post, NOW),
      ).resolves.toBeDefined();
      const row = await db.locationCheck.findFirstOrThrow();
      expect(row.guestSessionId).toBe((guest as { guest: { id: string } }).guest.id);
      expect(row.userId).toBeNull();
    });

    it('if auditing fails, a denial still reports its real reason', async () => {
      // Guest IDs that don't exist make the audit insert fail (foreign key).
      const ghost: LocationActor = {
        kind: 'guest',
        guest: { id: randomUUID(), installationId: randomUUID() },
      };
      expect(
        await denialCode(
          assertLocationEligible(ghost, reading(P.downtown), 'general.post', undefined, NOW),
        ),
      ).toBe('ACTION_NOT_ALLOWED');
    });

    // 🔒 Fail closed: no unaudited location-restricted action.
    it('if auditing fails on an allowed check, the action is refused', async () => {
      const ghost: LocationActor = {
        kind: 'guest',
        guest: { id: randomUUID(), installationId: randomUUID() },
      };
      const post = { kind: 'general' as const, point: P.downtown };
      await expect(
        assertLocationEligible(ghost, reading(P.downtown), 'general.comment', post, NOW),
      ).rejects.toThrow();
    });

    it('a banned user is refused even with a perfect reading', async () => {
      const banned: LocationActor = {
        kind: 'user',
        user: { ...(userActor as { user: object }).user, status: 'BANNED' } as never,
      };
      expect(
        await denialCode(
          assertLocationEligible(banned, reading(P.downtown), 'general.post', undefined, NOW),
        ),
      ).toBe('ACCOUNT_BANNED');
    });
  });

  describe('audit trail (D7, P2.5)', () => {
    it('records allowed and denied checks with the precise point and reason', async () => {
      await assertLocationEligible(userActor, reading(P.downtown), 'general.post', undefined, NOW);
      await denialCode(
        assertLocationEligible(userActor, reading(P.atlanta), 'general.post', undefined, NOW),
      );
      const rows = await db.$queryRaw<
        { result: string; reason: string | null; lat: number; lng: number }[]
      >`
        SELECT result::text, reason, ST_Y(point::geometry) AS lat, ST_X(point::geometry) AS lng
        FROM "LocationCheck" ORDER BY "receivedAt", result`;
      expect(rows).toHaveLength(2);
      expect(rows.find((r) => r.result === 'ALLOWED')).toMatchObject({
        reason: null,
        lat: P.downtown.latitude,
        lng: P.downtown.longitude,
      });
      expect(rows.find((r) => r.result === 'DENIED')?.reason).toBe('LOCATION_OUTSIDE_AREA');
    });
  });
});

describe('coarsenPoint (D7)', () => {
  it('rounds to 0.001° (~100 m) so stored post locations are not exact', () => {
    expect(coarsenPoint({ latitude: 30.31494, longitude: -81.68526 })).toEqual({
      latitude: 30.315,
      longitude: -81.685,
    });
  });

  it('never moves a point more than ~80 m', async () => {
    const p = { latitude: 30.31449, longitude: -81.68549 }; // worst case: near half-steps
    const c = coarsenPoint(p);
    const [row] = await db.$queryRaw<{ m: number }[]>`
      SELECT ST_Distance(
        ST_SetSRID(ST_MakePoint(${p.longitude}, ${p.latitude}), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${c.longitude}, ${c.latitude}), 4326)::geography) AS m`;
    expect(row!.m).toBeLessThan(80);
  });
});
