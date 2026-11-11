import { NextResponse } from 'next/server';
import { eventDaySchema } from '@jax/shared';
import { requireActor } from '@/server/auth/require-actor';
import { eventReadGate } from '@/server/events/read-gate';
import { eventDay } from '@/server/events/queries';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D230: one day's events, grouped by neighborhood (the nearest first), then by start time. */
export const POST = route(async (req) => {
  const actor = await requireActor(req);
  const { reading, ...input } = await parseBody(req, eventDaySchema);
  const { viewerId, at } = await eventReadGate(actor, reading);
  return NextResponse.json(await eventDay(viewerId, at, input));
});
