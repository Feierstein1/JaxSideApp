import { NextResponse } from 'next/server';
import { businessTwoFactorConfirmSchema } from '@jax/shared';
import { confirmTwoFactor, requireBusiness } from '@/server/auth';
import { parseBody, route } from '@/server/http';

export const POST = route(async (req) => {
  const { account } = await requireBusiness(req);
  const { code } = await parseBody(req, businessTwoFactorConfirmSchema);
  await confirmTwoFactor(account, code);
  return NextResponse.json({ ok: true });
});
