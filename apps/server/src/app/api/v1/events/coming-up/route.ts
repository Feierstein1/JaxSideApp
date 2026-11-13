import { NextResponse } from 'next/server';
import { eventReadSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { eventReadGate } from '@/server/events/read-gate';
import { eventsComingUp } from '@/server/events/queries';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/**
 * D241: events you follow that start today or tomorrow (the "Coming up" strip). Accounts
 * only (guests can't follow); a read, so it needs a verified in-Duval location (D16).
 */
export const POST = route(async (req) => {
  const actor = await requireUser(req);
  const { reading } = await parseBody(req, eventReadSchema);
  const { viewerId, at } = await eventReadGate({ kind: 'user', ...actor }, reading);
  return NextResponse.json({ events: await eventsComingUp(viewerId, at) });
});
