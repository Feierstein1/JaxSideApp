import { NextResponse } from 'next/server';
import { businessPasswordChangeSchema } from '@jax/shared';
import { changePassword, requireBusiness } from '@/server/auth';
import { parseBody, route } from '@/server/http';

/** Change password (also the forced change for new employees and reset passwords). */
export const POST = route(async (req) => {
  const { account, session } = await requireBusiness(req, { allowPasswordChange: true });
  const input = await parseBody(req, businessPasswordChangeSchema);
  await changePassword(account, session, input);
  return NextResponse.json({ ok: true });
});
