import { NextResponse } from 'next/server';
import { pollVoteSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { idFrom, type IdCtx } from '@/server/discussions/handlers';
import { route } from '@/server/http';
import { assertLocationEligible } from '@/server/location/eligibility';
import { assertPollOpen, castPollVote, pollVoterAllowed } from '@/server/polls';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/**
 * D123: one final vote. Confirmed accounts a few days old, from inside Duval. The vote is
 * stored under a per-poll code with the voter's ZIP; the ID and the reading are not.
 */
export const POST = route<IdCtx>(async (req, ctx) => {
  const { user } = await requireUser(req, { requireVerifiedEmail: true });
  const pollId = await idFrom(ctx);
  const input = await parseBody(req, pollVoteSchema);
  await enforce([
    {
      key: `poll-vote:user:${user.id}`,
      limitKey: 'rateLimit.pollVote.perMinute',
      windowSeconds: 60,
    },
  ]);
  await pollVoterAllowed(user);
  await assertPollOpen(pollId, input.choiceIds);
  const here = await assertLocationEligible({ kind: 'user', user }, input.reading, 'poll.vote');
  const poll = await castPollVote(user.id, pollId, input.choiceIds, here);
  return NextResponse.json({ poll });
});
