import { NextResponse } from 'next/server';
import { businessLoginSchema } from '@jax/shared';
import { accountView, assertSameOrigin, login, sessionCookies } from '@/server/auth';
import { parseBody, route } from '@/server/http';

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const input = await parseBody(req, businessLoginSchema);
  const result = await login(input, req);
  if (result.kind === 'twoFactor') {
    return NextResponse.json({ twoFactor: true, challenge: result.challenge });
  }
  const res = NextResponse.json({ account: accountView(result.account) });
  for (const cookie of sessionCookies(result)) res.headers.append('Set-Cookie', cookie);
  return res;
});
