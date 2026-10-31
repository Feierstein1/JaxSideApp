import { NextResponse } from 'next/server';
import { businessLoginSchema } from '@jax/shared';
import { assertSameOrigin, login, sessionCookies } from '@/server/auth';
import { parseBody, route } from '@/server/http';

export const POST = route(async (req) => {
  assertSameOrigin(req);
  const input = await parseBody(req, businessLoginSchema);
  const { token, csrfToken, expiresAt, account } = await login(input);
  const res = NextResponse.json({
    account: {
      id: account.id,
      email: account.email,
      mustChangePassword: account.mustChangePassword,
    },
  });
  for (const cookie of sessionCookies(token, csrfToken, expiresAt)) {
    res.headers.append('Set-Cookie', cookie);
  }
  return res;
});
