import { NextResponse } from 'next/server';
import { requireActor } from '@/server/auth/require-actor';
import { idFrom, type IdCtx } from '@/server/discussions/handlers';
import { NO_USER } from '@/server/discussions/comments';
import { ApiError, route } from '@/server/http';
import { getTopic } from '@/server/topics';

/**
 * D125: one city topic. D133: local topics are opened through their posts list, which checks
 * that you're nearby, so they aren't served here.
 */
export const GET = route<IdCtx>(async (req, ctx) => {
  const actor = await requireActor(req);
  const topic = await getTopic(await idFrom(ctx), actor.kind === 'user' ? actor.user.id : NO_USER);
  if (topic.scope === 'local') throw new ApiError(404, 'NOT_FOUND', 'Topic not found');
  return NextResponse.json({ topic });
});
