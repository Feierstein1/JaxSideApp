import {
  milesToMeters,
  type LocationDenialCode,
  type LocationReading,
  yardsLabel,
} from '@jax/shared';
import type { GuestSession, User } from '@/generated/prisma/client';
import { assertAccountUsable } from '../auth/standing';
import { getConfig } from '../config';
import { db } from '../db';
import { ApiError } from '../http';
import { logger } from '../logger';
import { isInServiceArea } from './service-area';

/** Who is acting. Guests arrive in Phase 4; the permission table already covers them. */
export type LocationActor =
  | { kind: 'user'; user: Pick<User, 'id' | 'status' | 'suspendedUntil' | 'deletedAt'> }
  | { kind: 'guest'; guest: Pick<GuestSession, 'id' | 'installationId'> };

/**
 * Location-restricted actions and who may take them (§5, §6.2, D16, D19, D20, D28).
 * Reads are included: out-of-area users see no location-based content (D16).
 */
export const LOCATION_ACTIONS = {
  'general.read': ['user', 'guest'],
  /** Directory search and place info: inside Duval, no radius (D16, D19). Not for guests (§5). */
  'directory.read': ['user'],
  'general.post': ['user'],
  /** Suggesting a place: inside Duval; the reading is the place's pin (D63). */
  'directory.submit': ['user'],
  'general.comment': ['user'], // guests are view-only (D54)
  'general.vote': ['user'],
  'business.read': ['user'],
  'business.post': ['user'],
  'business.comment': ['user'],
  'business.vote': ['user'],
  /** D94: voting on a place change: within the place radius of the spot. */
  'directory.verify': ['user'],
} as const satisfies Record<string, readonly LocationActor['kind'][]>;
export type LocationAction = keyof typeof LOCATION_ACTIONS;

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

/**
 * The place the action is about, when it has one:
 * - general.comment / general.vote: the post's stored point, within the general max radius (D20)
 * - business.*: the place's point, within the business max radius (D19)
 * - general.read / general.post: no target; inside the service area is enough
 */
export type LocationTarget =
  { kind: 'general'; point: GeoPoint } | { kind: 'business'; point: GeoPoint };

export interface EligibilityResult {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}

class LocationDenied extends ApiError {
  constructor(
    readonly reason: LocationDenialCode,
    message: string,
    details?: unknown,
  ) {
    super(403, reason, message, details);
  }
}

const deny = (reason: LocationDenialCode, message: string, details?: unknown) =>
  new LocationDenied(reason, message, details);

/**
 * The one server-side location gate (D7). Every location-restricted route calls this
 * AFTER auth, schema validation and rate limiting, and BEFORE ownership/business logic.
 *
 * Order: action permission → account standing → mock flag → freshness → accuracy →
 * inside the service area → within the target's radius. Every decision (allowed or
 * denied) is written to LocationCheck for abuse review (purged after 30 days, D14).
 * Throws 403 with a specific code; returns the validated point on success.
 */
export async function assertLocationEligible(
  actor: LocationActor,
  reading: LocationReading,
  action: LocationAction,
  target?: LocationTarget,
  now: Date = new Date(),
): Promise<EligibilityResult> {
  try {
    await check(actor, reading, action, target, now);
  } catch (err) {
    const reason =
      err instanceof LocationDenied ? err.reason : err instanceof ApiError ? err.code : 'ERROR';
    // A failed audit must not hide the real reason the user was denied.
    await audit(actor, reading, action, reason, now).catch((auditErr) =>
      logger.error({ err: auditErr, action }, 'location audit failed (denied check)'),
    );
    throw err;
  }
  // Fail closed: an allowed check that can't be audited does not go through.
  await audit(actor, reading, action, null, now);
  return {
    latitude: reading.latitude,
    longitude: reading.longitude,
    accuracyMeters: reading.accuracyMeters,
  };
}

async function check(
  actor: LocationActor,
  reading: LocationReading,
  action: LocationAction,
  target: LocationTarget | undefined,
  now: Date,
): Promise<void> {
  // 1. Is this account type allowed to do this at all? (e.g. guests can't post)
  if (!(LOCATION_ACTIONS[action] as readonly string[]).includes(actor.kind)) {
    throw deny(
      'ACTION_NOT_ALLOWED',
      'Your account type can’t do this. Create an account to continue.',
    );
  }

  // 2. Account standing. Normally already enforced by requireUser(); checked again here
  //    so this function is safe on its own.
  if (actor.kind === 'user') assertAccountUsable(actor.user, now);

  // 2b. A temporary restriction from an earlier impossible-travel flag (P2.6).
  const restriction = await activeRestriction(actor, now);
  if (restriction) {
    throw deny(
      'LOCATION_RESTRICTED',
      'Location features are paused for a few minutes because your location changed impossibly fast. Please try again later.',
      { restrictedUntil: restriction.toISOString() },
    );
  }

  // 3. Mock-location apps (Android reports this). Flagged for admin review.
  if (reading.mocked) {
    await recordFlag(actor, action, { kind: 'MOCKED_LOCATION' });
    throw deny('LOCATION_MOCKED', 'Turn off mock location apps to use this feature.');
  }

  // 4. Freshness, against the server clock.
  const [maxAge, maxSkew, maxAccuracy] = await Promise.all([
    getConfig('location.maxAgeSeconds'),
    getConfig('location.maxClockSkewSeconds'),
    getConfig('location.maxAccuracyMeters'),
  ]);
  const ageSeconds = (now.getTime() - reading.timestamp) / 1000;
  if (ageSeconds < -maxSkew) {
    throw deny(
      'LOCATION_CLOCK_SKEW',
      'Your phone’s clock looks wrong. Turn on automatic date & time and try again.',
    );
  }
  if (ageSeconds > maxAge) {
    throw deny('LOCATION_STALE', 'Your location reading is too old. Please try again.', {
      maxAgeSeconds: maxAge,
    });
  }

  // 5. Accuracy.
  if (reading.accuracyMeters > maxAccuracy) {
    throw deny(
      'LOCATION_INACCURATE',
      'Your location isn’t precise enough. Move to an open area or turn on precise location.',
      { maxAccuracyMeters: maxAccuracy },
    );
  }

  // 5b. Impossible travel since the previous reading (P2.6, D38).
  await checkTravel(actor, reading, action, now);

  // 6. Inside the service area (Duval County, D15).
  if (!(await isInServiceArea(db, reading.latitude, reading.longitude))) {
    throw deny('LOCATION_OUTSIDE_AREA', 'Jax is only available inside Duval County.');
  }

  // 7. Within the radius of the post or place.
  if (target) {
    const miles = await getConfig(
      target.kind === 'business' ? 'radius.business.maxMiles' : 'radius.general.maxMiles',
    );
    const maxMeters = milesToMeters(miles);
    const rows = await db.$queryRaw<{ within: boolean }[]>`
      SELECT ST_DWithin(
        ST_SetSRID(ST_MakePoint(${reading.longitude}, ${reading.latitude}), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${target.point.longitude}, ${target.point.latitude}), 4326)::geography,
        ${maxMeters}
      ) AS within`;
    if (!rows[0]?.within) {
      throw deny(
        'LOCATION_TOO_FAR',
        target.kind === 'business'
          ? `Get within ${yardsLabel(miles)} of this place to join its discussion.`
          : `Get within ${yardsLabel(miles)} of this post to take part.`,
        { maxMiles: miles },
      );
    }
  }
}

// ───────────────────────── Impossible travel (P2.6, D38) ─────────────────────────

function actorColumns(actor: LocationActor) {
  return {
    userId: actor.kind === 'user' ? actor.user.id : null,
    guestSessionId: actor.kind === 'guest' ? actor.guest.id : null,
  };
}

async function activeRestriction(actor: LocationActor, now: Date): Promise<Date | null> {
  const flag = await db.locationFlag.findFirst({
    where: { ...actorColumns(actor), restrictedUntil: { gt: now } },
    orderBy: { restrictedUntil: 'desc' },
    select: { restrictedUntil: true },
  });
  return flag?.restrictedUntil ?? null;
}

async function recordFlag(
  actor: LocationActor,
  action: LocationAction,
  data: {
    kind: 'IMPOSSIBLE_TRAVEL' | 'SUSPICIOUS_TRAVEL' | 'MOCKED_LOCATION';
    speedKmh?: number;
    distanceKm?: number;
    elapsedSeconds?: number;
    restrictedUntil?: Date;
  },
) {
  await db.locationFlag.create({ data: { ...actorColumns(actor), action, ...data } });
}

/**
 * Compares this reading with the actor's most recent one. The distance is reduced by
 * both readings' accuracy margins, so normal GPS jitter can't trigger it. One indexed
 * lookup plus one distance calculation per check.
 */
async function checkTravel(
  actor: LocationActor,
  reading: LocationReading,
  action: LocationAction,
  now: Date,
): Promise<void> {
  const [lookback, blockKmh, blockKm, flagKmh, flagKm, restrictMin] = await Promise.all([
    getConfig('location.travel.lookbackMinutes'),
    getConfig('location.travel.blockSpeedKmh'),
    getConfig('location.travel.blockMinDistanceKm'),
    getConfig('location.travel.flagSpeedKmh'),
    getConfig('location.travel.flagMinDistanceKm'),
    getConfig('location.travel.restrictMinutes'),
  ]);
  const { userId, guestSessionId } = actorColumns(actor);
  const since = new Date(now.getTime() - lookback * 60_000);
  const [prev] = await db.$queryRaw<{ readingAt: Date; accuracyMeters: number; meters: number }[]>`
    SELECT "readingAt", "accuracyMeters",
           ST_Distance(point, ST_SetSRID(ST_MakePoint(${reading.longitude}, ${reading.latitude}), 4326)::geography) AS meters
    FROM "LocationCheck"
    WHERE "receivedAt" > ${since}
      AND ("userId" = ${userId}::uuid OR "guestSessionId" = ${guestSessionId}::uuid)
    ORDER BY "receivedAt" DESC
    LIMIT 1`;
  if (!prev) return;

  const distanceKm = Math.max(0, prev.meters - prev.accuracyMeters - reading.accuracyMeters) / 1000;
  const elapsedSeconds = Math.max(1, (reading.timestamp - prev.readingAt.getTime()) / 1000);
  const speedKmh = distanceKm / (elapsedSeconds / 3600);
  const measured = {
    speedKmh: Math.round(speedKmh),
    distanceKm: Math.round(distanceKm * 10) / 10,
    elapsedSeconds: Math.round(elapsedSeconds),
  };

  if (speedKmh > blockKmh && distanceKm >= blockKm) {
    await recordFlag(actor, action, {
      kind: 'IMPOSSIBLE_TRAVEL',
      ...measured,
      restrictedUntil: new Date(now.getTime() + restrictMin * 60_000),
    });
    throw deny(
      'LOCATION_IMPOSSIBLE_TRAVEL',
      'Your location changed impossibly fast. Location features are paused for a few minutes.',
      { restrictMinutes: restrictMin },
    );
  }
  if (speedKmh > flagKmh && distanceKm >= flagKm) {
    await recordFlag(actor, action, { kind: 'SUSPICIOUS_TRAVEL', ...measured });
  }
}

/** Precise reading → LocationCheck (restricted; never exposed publicly, D7/§6.3). */
async function audit(
  actor: LocationActor,
  reading: LocationReading,
  action: LocationAction,
  reason: string | null,
  now: Date,
): Promise<void> {
  const userId = actor.kind === 'user' ? actor.user.id : null;
  const guestId = actor.kind === 'guest' ? actor.guest.id : null;
  const installationId = actor.kind === 'guest' ? actor.guest.installationId : null;
  await db.$executeRaw`
    INSERT INTO "LocationCheck"
      (id, "userId", "guestSessionId", "installationId", action, point, "accuracyMeters",
       "readingAt", "receivedAt", result, reason)
    VALUES (gen_random_uuid(), ${userId}::uuid, ${guestId}::uuid, ${installationId}::uuid, ${action},
            ST_SetSRID(ST_MakePoint(${reading.longitude}, ${reading.latitude}), 4326)::geography,
            ${reading.accuracyMeters}, ${new Date(reading.timestamp)}, ${now},
            ${reason === null ? 'ALLOWED' : 'DENIED'}::"LocationCheckResult", ${reason})`;
}

/**
 * Rounds a point to a ~100 m grid (D7) for storing with posts. 0.001° is 111 m of
 * latitude and about 96 m of longitude in Jacksonville, so the stored point is at most
 * ~74 m from the real one. The precise reading lives only in LocationCheck.
 */
export function coarsenPoint(p: GeoPoint): GeoPoint {
  const snap = (v: number) => Math.round(v * 1000) / 1000;
  return { latitude: snap(p.latitude), longitude: snap(p.longitude) };
}
