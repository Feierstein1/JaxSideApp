import { NextResponse } from 'next/server';
import { eventReadSchema } from '@jax/shared';
import { requireActor } from '@/server/auth/require-actor';
import { eventReadGate } from '@/server/events/read-gate';
import { eventsFeatured } from '@/server/events/queries';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/**
 * D248: Featured: events their hosts boosted, for the top of the Events tab (guests too). A
 * read, so it needs a verified in-Duval location (D16).
 */
export const POST = route(async (req) => {
  const actor = await requireActor(req);
  const { reading } = await parseBody(req, eventReadSchema);
  const { viewerId, at } = await eventReadGate(actor, reading);
  return NextResponse.json({ events: await eventsFeatured(viewerId, at) });
});
