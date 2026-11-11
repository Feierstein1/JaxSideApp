import { NextResponse } from 'next/server';
import { eventReadSchema } from '@jax/shared';
import { idFrom, type IdCtx } from '@/server/discussions/handlers';
import { requireActor } from '@/server/auth/require-actor';
import { eventReadGate } from '@/server/events/read-gate';
import { eventDetail } from '@/server/events/queries';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/**
 * D230: an event's page. A read, but POST because it carries the location reading (D16).
 * Drafts, events in review, suggestions, denied and removed events are 404, like unknown ones.
 */
export const POST = route<IdCtx>(async (req, ctx) => {
  const actor = await requireActor(req);
  const id = await idFrom(ctx);
  const { reading } = await parseBody(req, eventReadSchema);
  const { viewerId, at } = await eventReadGate(actor, reading);
  return NextResponse.json({ event: await eventDetail(viewerId, at, id) });
});
