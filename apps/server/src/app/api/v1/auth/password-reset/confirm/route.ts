import { NextResponse } from 'next/server';
import { passwordResetConfirmSchema } from '@jax/shared';
import { confirmPasswordReset } from '@/server/auth/service';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

export const POST = route(async (req) => {
  const { token, newPassword } = await parseBody(req, passwordResetConfirmSchema);
  return NextResponse.json(await confirmPasswordReset(token, newPassword));
});
