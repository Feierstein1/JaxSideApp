import { NextResponse } from 'next/server';
import { topicListSchema } from '@jax/shared';
import { requireActor } from '@/server/auth/require-actor';
import { NO_USER } from '@/server/discussions/comments';
import { route } from '@/server/http';
import { assertLocationEligible } from '@/server/location/eligibility';
import { enforce } from '@/server/rate-limit';
import { nearestNeighborhood } from '@/server/location/neighborhood';
import { listTopicPage } from '@/server/topics';
import { parseBody } from '@/server/validate';

/**
 * D133: topics of one kind (city or local), newest or oldest first, 20 at a time, with
 * search, category and Following filters. Local topics: only those within half a mile of
 * you. A read (POST because it carries the location reading).
 */
export const POST = route(async (req) => {
  const actor = await requireActor(req);
  const input = await parseBody(req, topicListSchema);
  const key = actor.kind === 'user' ? `user:${actor.user.id}` : `guest:${actor.guest.id}`;
  await enforce([
    { key: `topic-list:${key}`, limitKey: 'rateLimit.placeSearch.perMinute', windowSeconds: 60 },
  ]);
  const at = await assertLocationEligible(
    actor.kind === 'user'
      ? { kind: 'user', user: actor.user }
      : { kind: 'guest', guest: actor.guest },
    input.reading,
    'general.read',
  );
  const viewer = actor.kind === 'user' ? actor.user.id : NO_USER;
  const page = await listTopicPage(viewer, at, input);
  // D133: Local Topics shows where you are, like Home.
  return NextResponse.json(
    input.scope === 'local' ? { ...page, area: nearestNeighborhood(at) } : page,
  );
});
