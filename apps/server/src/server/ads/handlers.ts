import { NextResponse } from 'next/server';
import {
  adInterestSchema,
  adSlotsRequestSchema,
  adViewsSchema,
  emptyBodySchema,
} from '@jax/shared';
import { requireActor, requireUser } from '../auth/require-actor';
import {
  actorKey,
  activePlacePoint,
  idFrom,
  locationActor,
  type IdCtx,
} from '../discussions/handlers';
import { assertLocationEligible } from '../location/eligibility';
import { getConfig } from '../config';
import { enforce } from '../rate-limit';
import { topicAnchor } from '../topics';
import { parseBody } from '../validate';
import { recordAdTap, recordAdViews, setAdInterest } from './counting';
import { pickAdsFor } from './serve';

/**
 * D206 / B3.4: the phone's ad endpoints. Same order as every route (CLAUDE.md): auth guard →
 * strict schema → rate limit → location (the same rule as reading that screen's posts).
 */

const limit = (subject: string, key: 'ads' | 'adViews' | 'adInterest' | 'adTaps') =>
  enforce([
    {
      key: `${key}:${subject}`,
      limitKey: `rateLimit.${key}.perMinute`,
      windowSeconds: 60,
    },
  ]);

/** POST /ads: ads for the screen the phone is showing. Guests too, except place pages. */
export async function adsForScreen(req: Request) {
  const actor = await requireActor(req);
  const input = await parseBody(req, adSlotsRequestSchema);
  await limit(actorKey(actor), 'ads');
  const who = locationActor(actor);
  const ctx = input.context;
  let at;
  if (ctx.kind === 'place') {
    // Place discussions are for accounts only (P4.2), within the place's radius (D19).
    if (actor.kind !== 'user') return NextResponse.json({ ads: [] });
    at = await assertLocationEligible(who, input.reading, 'business.read', {
      kind: 'business',
      point: await activePlacePoint(ctx.id),
    });
  } else if (ctx.kind === 'topic') {
    const anchor = await topicAnchor(ctx.id);
    at = await assertLocationEligible(
      who,
      input.reading,
      'general.read',
      anchor.local ? { kind: 'topic', point: anchor.local } : undefined,
    );
  } else {
    at = await assertLocationEligible(who, input.reading, 'general.read');
  }
  const [ads, first, every, cooldownHours] = await Promise.all([
    pickAdsFor(
      { userId: actor.kind === 'user' ? actor.user.id : null, point: at },
      ctx,
      input.count,
      input.seen,
      undefined,
      undefined,
      input.inList,
    ),
    getConfig('ads.firstSlot'),
    getConfig(actor.kind === 'user' ? 'ads.every' : 'ads.everyGuest'),
    getConfig('ads.cooldownHours'),
  ]);
  // The admin's spacing and cooldown, so the phone follows them without an app update.
  return NextResponse.json({ ads, layout: { first, every, cooldownHours } });
}

/** POST /ads/views: a batch of ads the phone showed (half on screen for a second). */
export async function adViews(req: Request) {
  const actor = await requireActor(req);
  const { adIds } = await parseBody(req, adViewsSchema);
  await limit(actorKey(actor), 'adViews');
  return NextResponse.json({ counted: await recordAdViews(actorKey(actor), adIds) });
}

/** POST /ads/:id/interest: Interested / Not interested (accounts only). */
export async function adInterest(req: Request, ctx: IdCtx) {
  const { user } = await requireUser(req);
  const adId = await idFrom(ctx);
  const { choice } = await parseBody(req, adInterestSchema);
  await limit(`user:${user.id}`, 'adInterest');
  return NextResponse.json({ choice: await setAdInterest(user.id, adId, choice) });
}

/** POST /ads/:id/tap: the link button was tapped (D216; guests too, once a day each). */
export async function adTap(req: Request, ctx: IdCtx) {
  const actor = await requireActor(req);
  const adId = await idFrom(ctx);
  await parseBody(req, emptyBodySchema);
  await limit(actorKey(actor), 'adTaps');
  return NextResponse.json({ counted: await recordAdTap(actorKey(actor), adId) });
}
