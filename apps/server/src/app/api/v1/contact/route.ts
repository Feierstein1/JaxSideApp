import { NextResponse } from 'next/server';
import { contactSchema } from '@jax/shared';
import { requireActor } from '@/server/auth/require-actor';
import { createContactMessage } from '@/server/contact';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/** D90: Contact us: a support ticket or a general message, read in the admin portal. */
export const POST = route(async (req) => {
  const actor = await requireActor(req);
  const input = await parseBody(req, contactSchema);
  const who = actor.kind === 'user' ? `user:${actor.user.id}` : `guest:${actor.guest.id}`;
  await enforce([
    { key: `contact:${who}`, limitKey: 'rateLimit.contact.perHour', windowSeconds: 3600 },
  ]);
  return NextResponse.json(await createContactMessage(actor, input), { status: 201 });
});
