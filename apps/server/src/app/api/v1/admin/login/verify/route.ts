import { NextResponse } from 'next/server';
import { adminLoginVerifySchema } from '@jax/shared';
import { assertAdminReachable, completeAdminLogin, sessionCookies } from '@/server/admin/auth';
import { ipSubject } from '@/server/client-ip';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** P5.11 step 2: authenticator code. Starts the admin session (cookies). */
export const POST = route(async (req) => {
  assertAdminReachable(req); // D68
  const input = await parseBody(req, adminLoginVerifySchema);
  const { token, csrfToken, expiresAt } = await completeAdminLogin(input, {
    ipSubject: ipSubject(req),
  });
  const res = NextResponse.json({ ok: true });
  for (const c of sessionCookies(token, csrfToken, expiresAt)) res.headers.append('Set-Cookie', c);
  return res;
});
