import { NextResponse } from 'next/server';
import { requireActor } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { listPolls } from '@/server/polls';

/** D123: open polls (with your vote, if any) and recently closed ones with their results. */
export const GET = route(async (req) => {
  const actor = await requireActor(req);
  return NextResponse.json(await listPolls(actor.kind === 'user' ? actor.user.id : null));
});
