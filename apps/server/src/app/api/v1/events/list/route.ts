import { NextResponse } from 'next/server';
import { eventListSchema } from '@jax/shared';
import { requireActor } from '@/server/auth/require-actor';
import { eventReadGate } from '@/server/events/read-gate';
import { eventList } from '@/server/events/queries';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D230: the list view: events that haven't ended, soonest first, 20 at a time. */
export const POST = route(async (req) => {
  const actor = await requireActor(req);
  const { reading, ...input } = await parseBody(req, eventListSchema);
  const { viewerId, at } = await eventReadGate(actor, reading);
  return NextResponse.json(await eventList(viewerId, at, input));
});
