import { NextResponse } from 'next/server';
import { clearedCookies, logout, requireBusiness } from '@/server/auth';
import { route } from '@/server/http';

export const POST = route(async (req) => {
  const { session } = await requireBusiness(req, { allowPasswordChange: true });
  await logout(session);
  const res = NextResponse.json({ ok: true });
  for (const cookie of clearedCookies()) res.headers.append('Set-Cookie', cookie);
  return res;
});
