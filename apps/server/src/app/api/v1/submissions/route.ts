import { NextResponse } from 'next/server';
import { submissionCreateSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { createSubmission } from '@/server/directory/submissions';
import { route } from '@/server/http';
import { assertLocationEligible } from '@/server/location/eligibility';
import { parseBody } from '@/server/validate';

/**
 * P5.8: suggest a missing place (D63). The pin is the reading, which must be inside
 * Duval. Limits (daily, pending, account age) are checked in the service.
 */
export const POST = route(async (req) => {
  const { user } = await requireUser(req, { requireVerifiedEmail: true });
  const { reading, ...input } = await parseBody(req, submissionCreateSchema);
  await assertLocationEligible({ kind: 'user', user }, reading, 'directory.submit');
  // The exact reading is the place's pin (a business's location, not the person's home).
  return NextResponse.json(
    await createSubmission(
      user,
      { latitude: reading.latitude, longitude: reading.longitude },
      input,
    ),
    { status: 201 },
  );
});
