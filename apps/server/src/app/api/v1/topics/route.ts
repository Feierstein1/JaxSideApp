import { NextResponse } from 'next/server';
import { createTopicSchema } from '@jax/shared';
import { requireActor, requireUser } from '@/server/auth/require-actor';
import { NO_USER } from '@/server/discussions/comments';
import { route } from '@/server/http';
import { assertLocationEligible, coarsenPoint } from '@/server/location/eligibility';
import { enforce } from '@/server/rate-limit';
import { skipsAccountWaits } from '@/server/account-age';
import { assertTopicAllowance, createUserTopic, getTopic, listTopics } from '@/server/topics';
import { parseBody } from '@/server/validate';

/** D125: open city topics (pinned first) and closed ones. Accounts and guests. */
export const GET = route(async (req) => {
  const actor = await requireActor(req);
  return NextResponse.json(await listTopics(actor.kind === 'user' ? actor.user.id : NO_USER));
});

/**
 * D133: create a topic: city (anywhere in Duval) or local (placed at your coarsened
 * location; seen and posted in within half a mile). Confirmed accounts; screened like posts.
 */
export const POST = route(async (req) => {
  const { user } = await requireUser(req, { requireVerifiedEmail: true });
  const input = await parseBody(req, createTopicSchema);
  await enforce([
    {
      key: `topic-create:user:${user.id}`,
      limitKey: 'rateLimit.topicCreate.perDay',
      windowSeconds: 86_400,
    },
  ]);
  const at = await assertLocationEligible({ kind: 'user', user }, input.reading, 'general.post');
  // D143 / D147 (after the location check, per the route order): account age, one a month.
  await assertTopicAllowance(user, input.scope);
  const { id, held, pending } = await createUserTopic(user.id, input, coarsenPoint(at), {
    staff: skipsAccountWaits(user),
  });
  if (pending) {
    // D222: waiting for an admin; told in the same way as a held topic (202).
    return NextResponse.json(
      {
        held: true,
        pending: true,
        message:
          'Thanks! A JaxSide admin will look at your topic before it appears. You can follow it under Account → My suggestions.',
      },
      { status: 202 },
    );
  }
  if (held) {
    // D142: like a held post (202): the creator is told it appears after review.
    return NextResponse.json(
      { held: true, message: 'Thanks. A moderator will review this topic before it appears.' },
      { status: 202 },
    );
  }
  return NextResponse.json({ topic: await getTopic(id, user.id) }, { status: 201 });
});
