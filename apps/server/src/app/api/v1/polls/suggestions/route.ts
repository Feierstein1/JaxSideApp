import { NextResponse } from 'next/server';
import { suggestPollSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { suggestPoll } from '@/server/polls';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/** D133: suggest a poll question; the admin uses it or declines it. Confirmed accounts. */
export const POST = route(async (req) => {
  const { user } = await requireUser(req, { requireVerifiedEmail: true });
  const input = await parseBody(req, suggestPollSchema);
  await enforce([
    {
      key: `poll-suggest:user:${user.id}`,
      limitKey: 'rateLimit.pollSuggest.perDay',
      windowSeconds: 86_400,
    },
  ]);
  return NextResponse.json({ id: await suggestPoll(user.id, input) }, { status: 201 });
});
