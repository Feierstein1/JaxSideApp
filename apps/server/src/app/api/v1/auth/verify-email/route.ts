import { NextResponse } from 'next/server';
import { verifyEmailSchema } from '@jax/shared';
import { verifyEmail } from '@/server/auth/service';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** No session needed: the single-use emailed token is the credential. */
export const POST = route(async (req) => {
  const { token } = await parseBody(req, verifyEmailSchema);
  return NextResponse.json(await verifyEmail(token));
});
