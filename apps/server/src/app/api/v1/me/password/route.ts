import { NextResponse } from 'next/server';
import { passwordChangeSchema } from '@jax/shared';
import { changePassword } from '@/server/auth/account';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** P4.10: change password; other devices are signed out. Wrong guesses are rate-limited. */
export const POST = route(async (req) => {
  const { user, session } = await requireUser(req);
  const input = await parseBody(req, passwordChangeSchema);
  await changePassword(user, session.id, input.currentPassword, input.newPassword);
  return NextResponse.json({ status: 'password_changed' });
});
