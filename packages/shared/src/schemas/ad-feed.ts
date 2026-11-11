import { z } from 'zod';
import { seedFrom, seeded, type AdTemplateKind } from '../ads';
import { locationReadingSchema } from './location';

/**
 * D206: ads in the phone app's feeds (B3.4 / B3.6). The phone asks the server which ads to
 * show for the screen it is on, then places them between posts at `adSlotPositions`. The
 * server picks every ad; the phone only decides where they sit and remembers which ones it
 * showed recently (the cooldown), so the same ad doesn't come back for a few hours.
 */

/** Where the ads will be shown: the area feed, a place's discussion, or a topic. */
export const adContextSchema = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('feed') }),
  z.strictObject({ kind: z.literal('place'), id: z.uuid() }),
  z.strictObject({ kind: z.literal('topic'), id: z.uuid() }),
]);
export type AdContext = z.infer<typeof adContextSchema>;

export const AD_REQUEST_MAX = 10;
/** Ads the phone may list as "seen recently" (its cooldown) in one request. */
export const AD_SEEN_MAX = 200;

export const adSlotsRequestSchema = z.strictObject({
  reading: locationReadingSchema,
  context: adContextSchema,
  /** How many slots the phone wants to fill (the slots on the page it is showing). */
  count: z.number().int().min(1).max(AD_REQUEST_MAX),
  /** Ads shown on this phone within the cooldown (ads.cooldownHours): never picked again. */
  seen: z.array(z.uuid()).max(AD_SEEN_MAX).default([]),
});

/** One batch of views: an ad counts as seen when half of it was on screen for a second. */
export const AD_VIEWS_MAX = 50;
export const adViewsSchema = z.strictObject({
  adIds: z.array(z.uuid()).min(1).max(AD_VIEWS_MAX),
});

/** Interested / Not interested (one per person per ad); null takes it back. */
export const adInterestSchema = z.strictObject({
  choice: z.enum(['INTERESTED', 'NOT_INTERESTED']).nullable(),
});

/** An ad as the phone shows it. Never says who at the business made it. */
export interface AdCard {
  id: string;
  template: AdTemplateKind;
  headline: string;
  body: string | null;
  /** A signed link (relative) to the ad's image or GIF, if it has one. */
  imageUrl: string | null;
  /** Q30: alcohol deals show "21+". */
  adultsOnly: boolean;
  /** The place it promotes; null for an event organizer's ad (D230). */
  place: { id: string; name: string } | null;
  /**
   * D230: the event it promotes (its next date, Jacksonville time): the card shows when it is
   * and opens the event.
   */
  event: { id: string; title: string; date: string; startTime: string } | null;
  /** D216: one button (paid plans only); null when the ad has none or the plan doesn't allow it. */
  link: { url: string; label: string } | null;
  /** The reader's own choice on this ad, if any. */
  myChoice: 'INTERESTED' | 'NOT_INTERESTED' | null;
}

/** D206: the admin's ad spacing and cooldown, sent with every `POST /ads` answer. */
export interface AdLayout {
  first: number;
  every: number;
  cooldownHours: number;
}

export interface AdsResponse {
  ads: AdCard[];
  layout: AdLayout;
}

/**
 * D206: where ads go in a list of posts. Returns the post counts after which an ad sits
 * (e.g. [4, 12, 19] = after the 4th, 12th and 19th post), between `from` (posts already
 * shown on earlier pages; slots there are not repeated) and `to` (posts shown so far).
 * The first ad comes after about `first` posts, then one about every `every` posts, each
 * gap moved by -1, 0 or +1 so it doesn't feel mechanical. Never at the very top, never two
 * in a row. The same `seed` (e.g. the screen and the day) always gives the same slots, so
 * loading more posts continues the pattern instead of starting over.
 */
export function adSlotPositions(opts: {
  from: number;
  to: number;
  first: number;
  every: number;
  seed: string;
}): number[] {
  const first = Math.max(1, opts.first);
  const every = Math.max(3, opts.every);
  const rand = seeded(seedFrom(opts.seed));
  const jitter = () => Math.floor(rand() * 3) - 1;
  const out: number[] = [];
  let at = first + Math.max(0, jitter());
  while (at <= opts.to) {
    if (at > opts.from) out.push(at);
    at += every + jitter();
  }
  return out;
}
