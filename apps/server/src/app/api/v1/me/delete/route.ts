import { NextResponse } from 'next/server';
import { accountDeleteSchema } from '@jax/shared';
import { deleteAccount } from '@/server/auth/account';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** P4.12: delete your account (password, plus typing DELETE). */
export const POST = route(async (req) => {
  const { user } = await requireUser(req);
  const { password } = await parseBody(req, accountDeleteSchema);
  await deleteAccount(user, password);
  return NextResponse.json({ status: 'deleted' });
});
