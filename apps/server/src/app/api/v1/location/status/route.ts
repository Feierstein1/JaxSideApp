import { NextResponse } from 'next/server';
import { locationStatusRequestSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { assertLocationEligible } from '@/server/location/eligibility';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/**
 * P2.9: "Can I use location features where I am?" Runs the full server location check
 * for reading content (D16) and returns 200, or 403 with the specific reason.
 * POST so the coordinates travel in the body, never in a URL or access log.
 */
export const POST = route(async (req) => {
  const { user } = await requireUser(req);
  const { reading } = await parseBody(req, locationStatusRequestSchema);
  await enforce([
    {
      key: `location-status:user:${user.id}`,
      limitKey: 'rateLimit.locationStatus.perMinute',
      windowSeconds: 60,
    },
  ]);
  await assertLocationEligible({ kind: 'user', user }, reading, 'general.read');
  return NextResponse.json({ eligible: true });
});
