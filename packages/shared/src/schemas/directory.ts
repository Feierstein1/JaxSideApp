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
    categories: ['entertainment', 'attraction', 'museum', 'arts', 'venue', 'library'],
  },
  // D89: gyms get their own group and color (OSM fitness and sports centres).
  { key: 'fitness', label: 'Gyms & fitness', categories: ['fitness'] },
  {
    key: 'services',
    label: 'Services & auto',
    categories: ['car_dealer', 'automotive', 'gas_station', 'bank', 'pharmacy', 'post_office'],
  },
  { key: 'lodging', label: 'Hotels', categories: ['lodging'] },
] as const;

/**
 * D70: a color per category group so place types are easy to tell apart: dark, clearly
 * different hues (warm and cool), all with white text at ≥ 4.5:1 (tested).
 */
export const CATEGORY_COLORS: Record<(typeof CATEGORY_GROUPS)[number]['key'] | 'other', string> = {
  food: '#B71C1C', // red
  coffee: '#5D4037', // brown
  bars: '#6A1B9A', // purple
  outdoors: '#1B5E20', // green
  shopping: '#AD1457', // magenta
  fun: '#BF360C', // burnt orange
  services: '#0D47A1', // blue
  lodging: '#00695C', // teal-green
  fitness: '#283593', // indigo (D89)
  other: '#37474F', // slate
};

/** The color for a place's category (via its group; anything ungrouped is "other"). */
export function categoryColor(category: string): string {
  const group = CATEGORY_GROUPS.find((g) => (g.categories as readonly string[]).includes(category));
  return CATEGORY_COLORS[group?.key ?? 'other'];
}

// D74: 'popular' = most favorited by everyone.
export const PLACE_SORTS = ['relevance', 'distance', 'name', 'favorites', 'popular'] as const;
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

/** P2.15 / D71: one radius for the feed, Places, and everything location-based: 0.1, 0.2 or 0.3 mi. */
export const radiusPreferencesSchema = z.strictObject({
  radiusMiles: z.union([z.literal(0.1), z.literal(0.2), z.literal(0.3)]),
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
  /** Visible posts in this place's room (D41). */
  postCount: number;
  /** D74: how many people have this place as a favorite (who they are is never shown here). */
  favoriteCount: number;
}

// ───────────── D94: community place voting ─────────────

export const placeChangesSchema = z.strictObject({ reading: locationReadingSchema });
export const placeVoteSchema = z.strictObject({
  reading: locationReadingSchema,
  kind: z.enum(['add', 'remove']),
  id: z.uuid(),
  /** add: "It's here" (true) / "Not here"; remove: "Closed" (true) / "Still open". */
  support: z.boolean(),
});
export const placeRemovalSchema = z.strictObject({ reading: locationReadingSchema });

/** A suggested place or a removal request waiting for votes near you. */
export interface PlaceChange {
  kind: 'add' | 'remove';
  id: string;
  name: string;
  category: string;
  distanceMeters: number;
  /** Votes for the change ("It's here" / "Closed") and against it. */
  yes: number;
  no: number;
  /** Votes needed on one side to decide. */
  needed: number;
  /** Your vote, or null if you haven't voted. */
  myVote: boolean | null;
  /** You suggested it / asked for the removal (your vote is already counted). */
  mine: boolean;
  createdAt: string;
}

// ───────────── D103: verified business owners ─────────────

export const OWNER_METHODS = ['EMAIL', 'WEBSITE', 'PHONE'] as const;
export const ownerClaimSchema = z.strictObject({
  method: z.enum(OWNER_METHODS),
  /** EMAIL only: an address at the business's own web domain. */
  email: z.email().max(200).optional(),
});
export const ownerCodeSchema = z.strictObject({
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit code'),
});
export const ownerProofSchema = z.strictObject({
  proofUrl: z
    .url()
    .max(500)
    .refine((u) => /^https?:\/\//i.test(u), 'Enter a web link (http or https)'),
});
export const ownerDecisionSchema = z.strictObject({
  action: z.enum(['approve', 'reject', 'revoke']),
  note: z.string().trim().max(500).optional(),
});
