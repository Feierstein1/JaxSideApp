import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { myStanding } from '@/server/moderation/enforcement';

export const dynamic = 'force-dynamic';

/** P5.6: your warnings and suspensions that still count, with the reason given. */
export const GET = route(async (req) => {
  const { user } = await requireUser(req);
  return NextResponse.json(await myStanding(user.id));
});
