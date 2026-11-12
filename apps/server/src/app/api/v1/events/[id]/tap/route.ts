import { NextResponse } from 'next/server';
import { emptyBodySchema } from '@jax/shared';
import { requireActor } from '@/server/auth/require-actor';
import { actorKey, idFrom, type IdCtx } from '@/server/discussions/handlers';
import { recordEventTap } from '@/server/events/taps';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/** D236: a tap on an event's link button (counted once per person per event per day). */
export const POST = route<IdCtx>(async (req, ctx) => {
  const actor = await requireActor(req);
  const id = await idFrom(ctx);
  await parseBody(req, emptyBodySchema);
  await enforce([
    {
      key: `eventTaps:${actorKey(actor)}`,
      limitKey: 'rateLimit.adTaps.perMinute',
      windowSeconds: 60,
    },
  ]);
  return NextResponse.json({ counted: await recordEventTap(actorKey(actor), id) });
});
