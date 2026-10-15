import { z } from 'zod';
import { locationReadingSchema } from './location';

/**
 * Filter chips in the Places tab (D40). Each group maps to directory categories
 * (see apps/server/src/server/directory/osm.ts). Shared so the app and server agree.
 */
export const CATEGORY_GROUPS = [
  { key: 'food', label: 'Food', categories: ['restaurant', 'fast_food', 'dessert', 'bakery'] },
  { key: 'coffee', label: 'Coffee', categories: ['cafe'] },
  { key: 'bars', label: 'Bars & nightlife', categories: ['bar', 'nightlife'] },
  { key: 'outdoors', label: 'Parks & outdoors', categories: ['park', 'beach', 'marina', 'golf'] },
  {
    key: 'shopping',
    label: 'Shopping',
    categories: ['shop', 'mall', 'shopping', 'grocery', 'convenience', 'market'],
  },
  {
    key: 'fun',
    label: 'Things to do',
    categories: ['entertainment', 'attraction', 'museum', 'arts', 'venue', 'library', 'fitness'],
  },
  {
    key: 'services',
    label: 'Services & auto',
    categories: ['car_dealer', 'automotive', 'gas_station', 'bank', 'pharmacy', 'post_office'],
  },
  { key: 'lodging', label: 'Hotels', categories: ['lodging'] },
] as const;

export const PLACE_SORTS = ['relevance', 'distance', 'name', 'favorites'] as const;
export type PlaceSort = (typeof PLACE_SORTS)[number];

/** P2.13: search the directory by name, or list nearby places when `q` is empty. */
export const placeSearchSchema = z.strictObject({
  reading: locationReadingSchema,
  q: z.string().trim().max(80).optional(),
  categories: z
    .array(z.string().regex(/^[a-z_]{2,30}$/))
    .max(12)
    .optional(),
  /** Default: best match when searching by name, otherwise nearest first. */
  sort: z.enum(PLACE_SORTS).optional(),
  /** The map view asks for more pins at once. */
  limit: z.number().int().min(1).max(50).optional(),
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
