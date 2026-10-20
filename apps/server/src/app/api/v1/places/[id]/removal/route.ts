import { NextResponse } from 'next/server';
import { placeRemovalSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { activePlacePoint, idFrom, type IdCtx } from '@/server/discussions/handlers';
import { requestRemoval, voterAllowed } from '@/server/directory/place-changes';
import { route } from '@/server/http';
import { assertLocationEligible } from '@/server/location/eligibility';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/**
 * D94: "Closed or doesn't exist?" Opens a removal request (or joins the open one) with your
 * "closed" vote. You must be within 528 yd of the place.
 */
export const POST = route<IdCtx>(async (req, ctx) => {
  const { user } = await requireUser(req, { requireVerifiedEmail: true });
  const placeId = await idFrom(ctx);
  const input = await parseBody(req, placeRemovalSchema);
  await enforce([
    {
      key: `place-removal:user:${user.id}`,
      limitKey: 'rateLimit.placeRemoval.perDay',
      windowSeconds: 86_400,
    },
  ]);
  await voterAllowed(user);
  const here = await assertLocationEligible(
    { kind: 'user', user },
    input.reading,
    'directory.verify',
    { kind: 'business', point: await activePlacePoint(placeId) },
  );
  return NextResponse.json(await requestRemoval(user, placeId, here), { status: 201 });
});
