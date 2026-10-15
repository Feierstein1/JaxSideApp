import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { listBlocks } from '@/server/profiles';

export const dynamic = 'force-dynamic';

/** P4.11: the people you've blocked (settings). */
export const GET = route(async (req) => {
  const { user } = await requireUser(req);
  return NextResponse.json({ blocks: await listBlocks(user.id) });
});
