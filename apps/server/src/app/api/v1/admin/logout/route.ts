import { NextResponse } from 'next/server';
import { clearedCookies, requireAdmin } from '@/server/admin/auth';
import { db } from '@/server/db';
import { route } from '@/server/http';

/** P5.11: end the admin session. */
export const POST = route(async (req) => {
  const { session } = await requireAdmin(req);
  await db.session.update({ where: { id: session.id }, data: { revokedAt: new Date() } });
  const res = NextResponse.json({ ok: true });
  for (const c of clearedCookies()) res.headers.append('Set-Cookie', c);
  return res;
});
