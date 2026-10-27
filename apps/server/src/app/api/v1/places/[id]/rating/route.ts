import { NextResponse } from 'next/server';
import { placeRatingSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { activePlacePoint } from '@/server/discussions/handlers';
import { ratePlace } from '@/server/directory/ratings';
import { placeIdFrom, type PlaceRouteCtx as Ctx } from '@/server/directory/route-params';
import { route } from '@/server/http';
import { assertLocationEligible } from '@/server/location/eligibility';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/**
 * D144: like (+1), dislike (-1) or take back (0) your vote on a place. Only while you're
 * there (within the place radius), one vote per account (changeable), accounts a few days
 * old, never on your own place, and not while an admin has voting locked.
 */
export const PUT = route<Ctx>(async (req, ctx) => {
  const { user } = await requireUser(req, { requireVerifiedEmail: true });
  const placeId = await placeIdFrom(ctx);
  const input = await parseBody(req, placeRatingSchema);
  await enforce([
    {
      key: `place-rating:user:${user.id}`,
      limitKey: 'rateLimit.placeRating.perMinute',
      windowSeconds: 60,
    },
  ]);
  const place = await activePlacePoint(placeId);
  await assertLocationEligible({ kind: 'user', user }, input.reading, 'place.rate', {
    kind: 'business',
    point: place,
  });
  return NextResponse.json(await ratePlace(user, placeId, input.value));
});
