import { NextResponse } from 'next/server';
import { businessTwoFactorLoginSchema } from '@jax/shared';
import {
  accountView,
  assertSameOrigin,
  completeTwoFactorLogin,
  sessionCookies,
} from '@/server/auth';
import { parseBody, route } from '@/server/http';

/** Sign-in step 2: the authenticator code (rate limited per account inside). */
export const POST = route(async (req) => {
  assertSameOrigin(req);
  const input = await parseBody(req, businessTwoFactorLoginSchema);
  const result = await completeTwoFactorLogin(input);
  const res = NextResponse.json({ account: accountView(result.account) });
  for (const cookie of sessionCookies(result)) res.headers.append('Set-Cookie', cookie);
  return res;
});
