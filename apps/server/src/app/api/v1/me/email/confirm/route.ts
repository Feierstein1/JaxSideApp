import { NextResponse } from 'next/server';
import { emailChangeConfirmSchema } from '@jax/shared';
import { confirmEmailChange } from '@/server/auth/account';
import { requireUser } from '@/server/auth/require-actor';
import { ipSubject } from '@/server/client-ip';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** P4.10: finish an email change with the code. */
export const POST = route(async (req) => {
  const { user } = await requireUser(req);
  const { code } = await parseBody(req, emailChangeConfirmSchema);
  return NextResponse.json(await confirmEmailChange(user, code, { ipSubject: ipSubject(req) }));
});
