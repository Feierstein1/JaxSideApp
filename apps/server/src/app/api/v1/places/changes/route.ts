import { NextResponse } from 'next/server';
import { placeChangesSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { listNearbyChanges } from '@/server/directory/place-changes';
import { route } from '@/server/http';
import { assertLocationEligible } from '@/server/location/eligibility';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/** D94: "Verify changes near you": suggested places and removal requests within 528 yd. */
export const POST = route(async (req) => {
  const { user } = await requireUser(req);
  const input = await parseBody(req, placeChangesSchema);
  await enforce([
    {
      key: `place-search:user:${user.id}`,
      limitKey: 'rateLimit.placeSearch.perMinute',
      windowSeconds: 60,
    },
  ]);
  const here = await assertLocationEligible(
    { kind: 'user', user },
    input.reading,
    'directory.read',
  );
  return NextResponse.json({ changes: await listNearbyChanges(user, here) });
});
