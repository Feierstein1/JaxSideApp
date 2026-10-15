import { NextResponse } from 'next/server';
import { emptyBodySchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { resendVerification } from '@/server/auth/service';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

export const POST = route(async (req) => {
  const { user } = await requireUser(req);
  await parseBody(req, emptyBodySchema);
  return NextResponse.json(await resendVerification(user));
});
