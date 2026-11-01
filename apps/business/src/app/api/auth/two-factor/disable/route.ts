import { NextResponse } from 'next/server';
import { businessTwoFactorDisableSchema } from '@jax/shared';
import { disableTwoFactor, requireBusiness } from '@/server/auth';
import { parseBody, route } from '@/server/http';

export const POST = route(async (req) => {
  const { account } = await requireBusiness(req);
  const input = await parseBody(req, businessTwoFactorDisableSchema);
  await disableTwoFactor(account, input);
  return NextResponse.json({ ok: true });
});
