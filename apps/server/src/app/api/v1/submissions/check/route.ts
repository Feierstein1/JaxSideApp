import { NextResponse } from 'next/server';
import { submissionCheckSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { duplicateCandidates } from '@/server/directory/submissions';
import { route } from '@/server/http';
import { assertLocationEligible } from '@/server/location/eligibility';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/** P5.9: before suggesting a place, show listed places that might be the same one. */
export const POST = route(async (req) => {
  const { user } = await requireUser(req);
  const input = await parseBody(req, submissionCheckSchema);
  await enforce([
    {
      key: `place-search:user:${user.id}`,
      limitKey: 'rateLimit.placeSearch.perMinute',
      windowSeconds: 60,
    },
  ]);
  const at = await assertLocationEligible(
    { kind: 'user', user },
    input.reading,
    'directory.submit',
  );
  return NextResponse.json(await duplicateCandidates(at, input.name));
});
