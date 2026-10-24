import { NextResponse } from 'next/server';
import { suggestTopicSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { mySuggestions, suggestTopic } from '@/server/topics';
import { parseBody } from '@/server/validate';

/** D125: your topic suggestions and what happened to them. */
export const GET = route(async (req) => {
  const { user } = await requireUser(req);
  return NextResponse.json({ suggestions: await mySuggestions(user.id) });
});

/** D125: suggest a citywide topic; it waits for the admin. Confirmed accounts, 3 a day. */
export const POST = route(async (req) => {
  const { user } = await requireUser(req, { requireVerifiedEmail: true });
  const input = await parseBody(req, suggestTopicSchema);
  await enforce([
    {
      key: `topic-suggest:user:${user.id}`,
      limitKey: 'rateLimit.topicSuggest.perDay',
      windowSeconds: 86_400,
    },
  ]);
  return NextResponse.json({ id: await suggestTopic(user.id, input) }, { status: 201 });
});
