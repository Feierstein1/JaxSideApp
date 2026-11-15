import { NextResponse } from 'next/server';
import { eventReadSchema } from '@jax/shared';
import { requireActor } from '@/server/auth/require-actor';
import { eventReadGate } from '@/server/events/read-gate';
import { eventAreas } from '@/server/events/queries';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D248: neighborhoods and ZIPs with events to come, for the Events tab's "Where" filter. */
export const POST = route(async (req) => {
  const actor = await requireActor(req);
  const { reading } = await parseBody(req, eventReadSchema);
  await eventReadGate(actor, reading);
  return NextResponse.json(await eventAreas());
});
