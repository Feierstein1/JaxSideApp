import { z } from 'zod';
import { locationReadingSchema } from './location';

/** P2.13: search the directory by name, or list nearby places when `q` is empty. */
export const placeSearchSchema = z.strictObject({
  reading: locationReadingSchema,
  q: z.string().trim().max(80).optional(),
  category: z
    .string()
    .regex(/^[a-z_]{2,30}$/)
    .optional(),
  offset: z.number().int().min(0).max(200).default(0),
});
export type PlaceSearchRequest = z.infer<typeof placeSearchSchema>;

/** P2.15: the user's preferred radii in miles. Values outside the server's range are clamped. */
export const radiusPreferencesSchema = z
  .strictObject({
    generalRadiusMiles: z.number().positive().max(100).optional(),
    businessRadiusMiles: z.number().positive().max(100).optional(),
  })
  .refine((v) => v.generalRadiusMiles !== undefined || v.businessRadiusMiles !== undefined, {
    message: 'Provide at least one radius',
  });

/** A place as the app sees it (public business data; never user data). */
export interface PlaceSummary {
  id: string;
  name: string;
  category: string;
  address: string | null;
  latitude: number;
  longitude: number;
  distanceMeters: number;
  isFavorite: boolean;
  /** Within the business radius right now, so its discussion room would open (D19). */
  withinRoomRadius: boolean;
}
