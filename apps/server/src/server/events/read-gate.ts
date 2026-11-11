import type { LocationReading } from '@jax/shared';
import type { requireActor } from '../auth/require-actor';
import { NO_USER } from '../discussions/comments';
import { assertLocationEligible } from '../location/eligibility';
import { enforce } from '../rate-limit';

type Actor = Awaited<ReturnType<typeof requireActor>>;

/**
 * D230: every Events tab read, in the route order (auth → schema → rate limit → location):
 * `requireActor` first, then the route parses its body, then this applies the list rate limit
 * and checks the reading is verified and inside Duval (D16). Returns who is reading (guests get
 * the no-one ID, so they never "follow" anything) and where.
 */
export async function eventReadGate(actor: Actor, reading: LocationReading) {
  const key = actor.kind === 'user' ? `user:${actor.user.id}` : `guest:${actor.guest.id}`;
  await enforce([
    { key: `event-list:${key}`, limitKey: 'rateLimit.eventList.perMinute', windowSeconds: 60 },
  ]);
  const at = await assertLocationEligible(
    actor.kind === 'user'
      ? { kind: 'user', user: actor.user }
      : { kind: 'guest', guest: actor.guest },
    reading,
    'general.read',
  );
  return { viewerId: actor.kind === 'user' ? actor.user.id : NO_USER, at };
}
