import { NextResponse } from 'next/server';
import { adminLoginSchema } from '@jax/shared';
import { assertAdminReachable, startAdminLogin } from '@/server/admin/auth';
import { ipSubject } from '@/server/client-ip';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** P5.11 step 1: password. Returns a short-lived challenge (and 2FA setup the first time). */
export const POST = route(async (req) => {
  assertAdminReachable(req); // D68
  const input = await parseBody(req, adminLoginSchema);
  return NextResponse.json(await startAdminLogin(input, { ipSubject: ipSubject(req) }));
});
