import { NextResponse } from 'next/server';
import { POLL_TOPICS, type PollTopic } from '@jax/shared';
import { requireActor } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { listPolls } from '@/server/polls';

/**
 * D123 / D124: open polls (with your answers, if any) and recently closed ones with their
 * results. `?topic=prices` narrows both to one topic (an unknown topic is ignored).
 */
export const GET = route(async (req) => {
  const actor = await requireActor(req);
  const t = new URL(req.url).searchParams.get('topic');
  const topic = t && t in POLL_TOPICS ? (t as PollTopic) : undefined;
  return NextResponse.json(
    await listPolls(actor.kind === 'user' ? actor.user.id : null, { topic }),
  );
});
