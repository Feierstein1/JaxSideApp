import { NextResponse } from 'next/server';
import { updateTopicSchema } from '@jax/shared';
import { requireActor, requireUser } from '@/server/auth/require-actor';
import { idFrom, type IdCtx } from '@/server/discussions/handlers';
import { NO_USER } from '@/server/discussions/comments';
import { ApiError, route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { deleteOwnTopic, getTopic, setShowCreator } from '@/server/topics';
import { parseBody } from '@/server/validate';

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

const editLimit = (userId: string) =>
  enforce([
    { key: `topic-edit:user:${userId}`, limitKey: 'rateLimit.edit.perMinute', windowSeconds: 60 },
  ]);

/**
 * D134: the creator shows or hides their username on the topic (the only change allowed;
 * the title, description and category can't be edited).
 */
export const PATCH = route<IdCtx>(async (req, ctx) => {
  const { user } = await requireUser(req);
  const id = await idFrom(ctx);
  const input = await parseBody(req, updateTopicSchema);
  await editLimit(user.id);
  await setShowCreator(user.id, id, input.showCreator);
  return NextResponse.json({ topic: await getTopic(id, user.id) });
});

/** D134: the creator deletes their topic (hidden at once; purged with its posts in a week). */
export const DELETE = route<IdCtx>(async (req, ctx) => {
  const { user } = await requireUser(req);
  const id = await idFrom(ctx);
  await editLimit(user.id);
  await deleteOwnTopic(user.id, id);
  return NextResponse.json({ ok: true });
});
