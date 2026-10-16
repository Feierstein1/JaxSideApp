import { NextResponse } from 'next/server';
import { medalsFor } from '@/server/achievements';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';

export const dynamic = 'force-dynamic';

/** P6.9: your own medals (Account → Profile). */
export const GET = route(async (req) => {
  const { user } = await requireUser(req);
  return NextResponse.json({ medals: await medalsFor(user.id) });
});
