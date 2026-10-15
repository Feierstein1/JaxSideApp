import { NextResponse } from 'next/server';
import { emailChangeSchema } from '@jax/shared';
import { startEmailChange } from '@/server/auth/account';
import { requireUser } from '@/server/auth/require-actor';
import { ipSubject } from '@/server/client-ip';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** P4.10: start an email change (a code is sent to the new address). */
export const POST = route(async (req) => {
  const { user } = await requireUser(req);
  const input = await parseBody(req, emailChangeSchema);
  const result = await startEmailChange(user, input.newEmail, input.password, {
    ipSubject: ipSubject(req),
  });
  return NextResponse.json(result, { status: 202 });
});
