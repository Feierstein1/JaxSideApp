import { NextResponse } from 'next/server';
import { passwordResetRequestSchema } from '@jax/shared';
import { requestPasswordReset } from '@/server/auth/service';
import { ipSubject } from '@/server/client-ip';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** Always 202 with the same body, whether or not the email has an account. */
export const POST = route(async (req) => {
  const { email } = await parseBody(req, passwordResetRequestSchema);
  const result = await requestPasswordReset(email, { ipSubject: ipSubject(req) });
  return NextResponse.json(result, { status: 202 });
});
