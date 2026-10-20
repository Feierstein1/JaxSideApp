import { NextResponse } from 'next/server';
import { placeVoteSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { castPlaceVote, changePoint, voterAllowed } from '@/server/directory/place-changes';
import { route } from '@/server/http';
import { assertLocationEligible } from '@/server/location/eligibility';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/**
 * D94: one final vote on a suggested place ("It's here" / "Not here") or a removal request
 * ("Closed" / "Still open"). Confirmed accounts a few days old, standing within 528 yd.
 */
export const POST = route(async (req) => {
  const { user } = await requireUser(req, { requireVerifiedEmail: true });
  const input = await parseBody(req, placeVoteSchema);
  await enforce([
    {
      key: `place-vote:user:${user.id}`,
      limitKey: 'rateLimit.placeVote.perMinute',
      windowSeconds: 60,
    },
  ]);
  await voterAllowed(user);
  const target = { kind: input.kind, id: input.id };
  const here = await assertLocationEligible(
    { kind: 'user', user },
    input.reading,
    'directory.verify',
    { kind: 'business', point: await changePoint(target) },
  );
  return NextResponse.json(await castPlaceVote(user, target, input.support, here));
});
