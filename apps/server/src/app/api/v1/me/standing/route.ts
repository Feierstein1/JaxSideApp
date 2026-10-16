import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { standingWithAppeals } from '@/server/moderation/appeals';

export const dynamic = 'force-dynamic';

/** P5.6: your warnings and suspensions that still count, the reason given, and appeals (P5.7). */
export const GET = route(async (req) => {
  const { user } = await requireUser(req);
  return NextResponse.json(await standingWithAppeals(user));
});
