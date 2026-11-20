import { NextResponse } from 'next/server';
import { adminLoginSchema } from '@jax/shared';
import { assertAdminReachable, sessionCookies, startAdminLogin } from '@/server/admin/auth';
import { ipSubject } from '@/server/client-ip';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/**
 * P5.11 step 1: password. Returns a short-lived challenge (and 2FA setup the first time). D274:
 * with two-step switched off on this computer, signs in at once (cookies, `signedIn: true`).
 */
export const POST = route(async (req) => {
  assertAdminReachable(req); // D68
  const input = await parseBody(req, adminLoginSchema);
  const { session, ...step } = await startAdminLogin(input, { ipSubject: ipSubject(req) });
  if (!session) return NextResponse.json({ ...step, signedIn: false });
  const res = NextResponse.json({ challenge: null, enroll: null, signedIn: true });
  for (const c of sessionCookies(session.token, session.csrfToken, session.expiresAt)) {
    res.headers.append('Set-Cookie', c);
  }
  return res;
});
