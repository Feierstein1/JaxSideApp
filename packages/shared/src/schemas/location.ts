import { z } from 'zod';

/**
 * A GPS reading sent with every location-restricted request (§6.2, D7).
 * Shape checks only. Freshness, accuracy, boundary and radius are decided by the server.
 */
export const locationReadingSchema = z.strictObject({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  /** Device-reported accuracy radius in meters (68% confidence on both platforms). */
  accuracyMeters: z.number().positive().max(100_000),
  /** When the device took the reading, in epoch milliseconds. */
  timestamp: z.number().int().positive(),
  /** Android reports readings from mock-location apps. Treated as a denial when true. */
  mocked: z.boolean().optional(),
});
export type LocationReading = z.infer<typeof locationReadingSchema>;

/** Body for endpoints that only need a reading (e.g. location status, place search). */
export const locationStatusRequestSchema = z.strictObject({
  reading: locationReadingSchema,
});

/** Why a location check failed. The app maps each to a helpful message. */
export const LOCATION_DENIAL_CODES = [
  'LOCATION_STALE',
  'LOCATION_CLOCK_SKEW',
  'LOCATION_INACCURATE',
  'LOCATION_MOCKED',
  'LOCATION_OUTSIDE_AREA',
  'LOCATION_TOO_FAR',
  'LOCATION_IMPOSSIBLE_TRAVEL',
  'LOCATION_RESTRICTED',
  'ACTION_NOT_ALLOWED',
] as const;
export type LocationDenialCode = (typeof LOCATION_DENIAL_CODES)[number];
