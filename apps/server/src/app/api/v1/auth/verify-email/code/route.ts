import { NextResponse } from 'next/server';
import { verifyEmailCodeSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { verifyEmailByCode } from '@/server/auth/service';
import { ipSubject } from '@/server/client-ip';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D31: confirm email in the app with the 6-digit code. Session required (no verified email needed). */
export const POST = route(async (req) => {
  const { user } = await requireUser(req);
  const { code } = await parseBody(req, verifyEmailCodeSchema);
  return NextResponse.json(await verifyEmailByCode(user, code, { ipSubject: ipSubject(req) }));
});
