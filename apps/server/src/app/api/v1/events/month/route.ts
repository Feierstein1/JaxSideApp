import { NextResponse } from 'next/server';
import { eventMonthSchema } from '@jax/shared';
import { requireActor } from '@/server/auth/require-actor';
import { eventReadGate } from '@/server/events/read-gate';
import { eventMonth } from '@/server/events/queries';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D230: the calendar: how many events on each day of a month, with the tab's filters. */
export const POST = route(async (req) => {
  const actor = await requireActor(req);
  const { reading, ...input } = await parseBody(req, eventMonthSchema);
  const { viewerId, at } = await eventReadGate(actor, reading);
  return NextResponse.json(await eventMonth(viewerId, at, input));
});
