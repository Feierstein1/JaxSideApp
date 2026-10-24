import { NextResponse } from 'next/server';
import { requireActor } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { listTopics } from '@/server/topics';

/** D125: open citywide topics (pinned first) and closed ones. Accounts and guests. */
export const GET = route(async (req) => {
  await requireActor(req);
  return NextResponse.json(await listTopics());
});
