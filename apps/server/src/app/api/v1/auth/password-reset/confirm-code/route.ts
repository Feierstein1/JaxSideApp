import { NextResponse } from 'next/server';
import { passwordResetCodeSchema } from '@jax/shared';
import { confirmPasswordResetByCode } from '@/server/auth/service';
import { ipSubject } from '@/server/client-ip';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D31: reset the password in the app with email + 6-digit code + new password. */
export const POST = route(async (req) => {
  const input = await parseBody(req, passwordResetCodeSchema);
  return NextResponse.json(await confirmPasswordResetByCode(input, { ipSubject: ipSubject(req) }));
});
