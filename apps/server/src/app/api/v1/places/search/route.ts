import { NextResponse } from 'next/server';
import { placeSearchSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { searchPlaces } from '@/server/directory/places';
import { OSM_ATTRIBUTION } from '@/server/directory/osm';
import { route } from '@/server/http';
import { radiusPreference } from '@/server/profiles';
import { assertLocationEligible } from '@/server/location/eligibility';
import { nearestNeighborhood } from '@/server/location/neighborhood';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/** P2.13: search the directory. Needs a fresh in-Duval reading (D16); no radius (D19). */
export const POST = route(async (req) => {
  const { user } = await requireUser(req);
  const input = await parseBody(req, placeSearchSchema);
  await enforce([
    {
      key: `place-search:user:${user.id}`,
      limitKey: 'rateLimit.placeSearch.perMinute',
      windowSeconds: 60,
    },
  ]);
  const { latitude, longitude } = await assertLocationEligible(
    { kind: 'user', user },
    input.reading,
    'directory.read',
  );
  const result = await searchPlaces({
    userId: user.id,
    latitude,
    longitude,
    q: input.q,
    categories: input.categories,
    sort: input.sort,
    limit: input.limit,
    offset: input.offset,
    radiusMiles: await radiusPreference(user.id), // D108
  });
  // ODbL: data shown in the app must carry the attribution (P2.12).
  // D72: "Near Avondale" above the list, for the searcher's own location only.
  const area = nearestNeighborhood({ latitude, longitude });
  return NextResponse.json({ ...result, area, attribution: OSM_ATTRIBUTION });
});
