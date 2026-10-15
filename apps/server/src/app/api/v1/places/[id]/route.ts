import { NextResponse } from 'next/server';
import { locationStatusRequestSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { getPlace } from '@/server/directory/places';
import { OSM_ATTRIBUTION } from '@/server/directory/osm';
import { route } from '@/server/http';
import { placeIdFrom, type PlaceRouteCtx as Ctx } from '@/server/directory/route-params';
import { assertLocationEligible } from '@/server/location/eligibility';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/** P2.13: one place's info and distance. Body carries the reading, so it's a POST. */
export const POST = route<Ctx>(async (req, ctx) => {
  const { user } = await requireUser(req);
  const placeId = await placeIdFrom(ctx);
  const { reading } = await parseBody(req, locationStatusRequestSchema);
  await enforce([
    {
      key: `place-search:user:${user.id}`,
      limitKey: 'rateLimit.placeSearch.perMinute',
      windowSeconds: 60,
    },
  ]);
  const { latitude, longitude } = await assertLocationEligible(
    { kind: 'user', user },
    reading,
    'directory.read',
  );
  const place = await getPlace({ userId: user.id, placeId, latitude, longitude });
  return NextResponse.json({ place, attribution: OSM_ATTRIBUTION });
});
