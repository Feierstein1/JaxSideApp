import { NextResponse } from 'next/server';
import { suggestEventSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { myEventSuggestions, suggestEvent } from '@/server/events/people';
import { route } from '@/server/http';
import { assertLocationEligible } from '@/server/location/eligibility';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/** D230: your event suggestions and what happened to them. */
export const GET = route(async (req) => {
  const { user } = await requireUser(req);
  return NextResponse.json({ suggestions: await myEventSuggestions(user.id) });
});

/**
 * D230: suggest a missing event. It waits for JaxSide to check it and set its pin. Confirmed
 * accounts inside Duval, 3 a day, screened like posts.
 */
export const POST = route(async (req) => {
  const { user } = await requireUser(req, { requireVerifiedEmail: true });
  const { reading, ...input } = await parseBody(req, suggestEventSchema);
  await enforce([
    {
      key: `event-suggest:user:${user.id}`,
      limitKey: 'rateLimit.eventSuggest.perDay',
      windowSeconds: 86_400,
    },
  ]);
  await assertLocationEligible({ kind: 'user', user }, reading, 'general.post');
  const id = await suggestEvent(user, input);
  return NextResponse.json(
    {
      id,
      message:
        'Thanks! JaxSide will check your event before it goes on the calendar. You can follow it under Events → My suggestions.',
    },
    { status: 201 },
  );
});
