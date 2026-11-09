import { z } from 'zod';
import { PLACE_NAME_MAX, SUBMIT_CATEGORIES } from './submission';

/**
 * D185 / D224: how a business gets its place on JaxSide, from the owner website. The owner
 * looks up their place; if it's there, "Ask JaxSide to verify me" sends its id; if not,
 * "Add my business" sends the name, kind, address and the pin they confirmed on a map (the
 * address is geocoded, then the pin can be dragged onto the door). Either way a JaxSide
 * admin decides in the admin portal (Owners), which adds a new place to the map and gives
 * the business Owner access. Written by the website into `BusinessVerificationRequest`.
 */
export const placeRequestSchema = z
  .strictObject({
    /** An existing place (from the website's search); left out for a new one. */
    placeId: z.uuid().optional(),
    /** The map's limit (PLACE_NAME_MAX), so an approved new place never fails on its name. */
    placeName: z.string().trim().min(2).max(PLACE_NAME_MAX),
    placeAddress: z.string().trim().min(5).max(300).optional(),
    category: z.enum(SUBMIT_CATEGORIES as unknown as [string, ...string[]]).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    contactName: z.string().trim().min(2).max(100),
    contactPhone: z.string().trim().max(40).optional(),
    note: z.string().trim().max(1000).optional(),
  })
  .refine((r) => (r.latitude === undefined) === (r.longitude === undefined), {
    path: ['latitude'],
    message: 'Place the pin on the map',
  })
  .refine((r) => r.placeId || (r.placeAddress && r.category && r.latitude !== undefined), {
    path: ['placeAddress'],
    message: 'A new place needs its address, its kind and a pin on the map',
  });
export type PlaceRequest = z.infer<typeof placeRequestSchema>;

/** The admin's answer: approve (optionally linking an existing place instead), or say no. */
export const adminPlaceRequestDecisionSchema = z
  .strictObject({
    decision: z.enum(['approve', 'reject']),
    /** Approve onto this existing place (e.g. the request turned out to be a duplicate). */
    usePlaceId: z.uuid().optional(),
    /** Shown to the business when turned down. */
    note: z.string().trim().max(500).optional(),
  })
  .refine((d) => d.decision === 'approve' || (d.note?.length ?? 0) >= 3, {
    path: ['note'],
    message: 'Say why, so the business knows what to do',
  });

// ───────────────────────────── Geocoding (US Census) ─────────────────────────────

/**
 * D224: address → map point with the US Census Bureau geocoder (free, no key, public data).
 * The website fetches `censusGeocodeUrl(address)` from its server (allow ~8 s; it can be
 * slow), reads it with `parseCensusGeocode`, and the owner confirms or drags the pin. Null
 * means not found: ask them to check the address, or drop the pin by hand.
 */
export function censusGeocodeUrl(address: string): string {
  return (
    'https://geocoding.geo.census.gov/geocoder/locations/onelineaddress' +
    `?address=${encodeURIComponent(address)}&benchmark=Public_AR_Current&format=json`
  );
}

export interface GeocodeMatch {
  latitude: number;
  longitude: number;
  /** The address as the Census matched it (show it so the owner can check). */
  matchedAddress: string;
}

/** The first match in a Census geocoder answer, or null. */
export function parseCensusGeocode(json: unknown): GeocodeMatch | null {
  const m = (
    json as {
      result?: {
        addressMatches?: { matchedAddress?: string; coordinates?: { x?: number; y?: number } }[];
      };
    }
  )?.result?.addressMatches?.[0];
  const x = m?.coordinates?.x;
  const y = m?.coordinates?.y;
  if (typeof x !== 'number' || typeof y !== 'number' || !m?.matchedAddress) return null;
  return { latitude: y, longitude: x, matchedAddress: m.matchedAddress };
}
