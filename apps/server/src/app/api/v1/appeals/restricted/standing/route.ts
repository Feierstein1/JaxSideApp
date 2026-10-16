import { NextResponse } from 'next/server';
import { restrictedStandingSchema } from '@jax/shared';
import { route } from '@/server/http';
import { standingWithAppeals } from '@/server/moderation/appeals';
import { restrictedUser } from '@/server/moderation/restricted';
import { parseBody } from '@/server/validate';

/** P5.7: a banned or suspended person sees why, and what they can appeal. */
export const POST = route(async (req) => {
  const input = await parseBody(req, restrictedStandingSchema);
  const user = await restrictedUser(req, input);
  return NextResponse.json(await standingWithAppeals(user));
});
