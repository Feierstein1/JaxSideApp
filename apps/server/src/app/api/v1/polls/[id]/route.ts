import { NextResponse } from 'next/server';
import { requireActor } from '@/server/auth/require-actor';
import { idFrom, type IdCtx } from '@/server/discussions/handlers';
import { route } from '@/server/http';
import { getPoll } from '@/server/polls';

/** D123: one poll; results (per choice and ZIP) once it has closed. */
export const GET = route<IdCtx>(async (req, ctx) => {
  const actor = await requireActor(req);
  const id = await idFrom(ctx);
  const poll = await getPoll(id, actor.kind === 'user' ? actor.user.id : null);
  return NextResponse.json({ poll });
});
