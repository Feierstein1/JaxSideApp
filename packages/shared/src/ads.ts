/**
 * Ads (D165–D168, D177): the pure rules both servers use. The app server uses them to mix
 * ads into feeds; the business website uses them for the editor, the preview and the
 * plan limits. Nothing here touches a database, the network or the clock (pass `now`).
 *
 * Times are Jacksonville local time (America/New_York), daylight saving included.
 */

export const AD_TIME_ZONE = 'America/New_York';

/** D167: saved ads per business (drafts and past ads count). */
export const AD_LIBRARY_MAX = 20;
/** D167: ads live at once, at most; a plan may allow fewer (D204: 5, Premium's). */
export const AD_LIVE_MAX = 5;

export type AdTemplateKind = 'BANNER' | 'POST' | 'FEATURE';
export type AdStatusKind = 'DRAFT' | 'PENDING_REVIEW' | 'APPROVED' | 'PAUSED' | 'ENDED';

/**
 * D177: the fixed templates (no custom layouts or code). Proposed sizes, to be tuned once
 * the owner sees them in the app. Images are stored at these pixel sizes (or larger in the
 * same shape); the phone shows them scaled to the card width.
 */
export const AD_TEMPLATES = {
  BANNER: {
    label: 'Banner',
    where: 'A slim strip between two posts.',
    image: { required: true, width: 1200, height: 300, minWidth: 800, minHeight: 200 },
    headlineMax: 40,
    bodyMax: 0,
    maxBytes: { image: 1_500_000, gif: 2_000_000 },
  },
  POST: {
    label: 'Post',
    where: 'Looks like a post in the list, with a photo if you add one.',
    image: { required: false, width: 1080, height: 1080, minWidth: 600, minHeight: 600 },
    headlineMax: 60,
    bodyMax: 280,
    maxBytes: { image: 2_000_000, gif: 3_000_000 },
  },
  FEATURE: {
    label: 'Feature',
    where: 'A large card with a tall photo.',
    image: { required: true, width: 1080, height: 1350, minWidth: 720, minHeight: 900 },
    headlineMax: 60,
    bodyMax: 140,
    maxBytes: { image: 3_000_000, gif: 4_000_000 },
  },
} as const satisfies Record<
  AdTemplateKind,
  {
    label: string;
    where: string;
    image: {
      required: boolean;
      width: number;
      height: number;
      minWidth: number;
      minHeight: number;
    };
    headlineMax: number;
    bodyMax: number;
    maxBytes: { image: number; gif: number };
  }
>;

/** GIFs: how long one loop may run, and how many frames, before it's refused. */
export const AD_GIF_LIMITS = { maxSeconds: 8, maxFrames: 120 } as const;

/** Allowed difference from a template's shape (width ÷ height), so near-fits pass. */
const SHAPE_TOLERANCE = 0.03;

/** Problems with an image for a template, in plain words (empty when it fits). */
export function checkAdImage(
  template: AdTemplateKind,
  image: { width: number; height: number; bytes: number; gif: boolean },
): string[] {
  const t = AD_TEMPLATES[template];
  const problems: string[] = [];
  const want = t.image.width / t.image.height;
  const have = image.width / image.height;
  if (Math.abs(have - want) / want > SHAPE_TOLERANCE) {
    problems.push(
      `This picture is the wrong shape for a ${t.label.toLowerCase()}. Use ${t.image.width} × ${t.image.height} pixels (or the same shape, larger).`,
    );
  }
  if (image.width < t.image.minWidth || image.height < t.image.minHeight) {
    problems.push(
      `This picture is too small (${image.width} × ${image.height}). It needs at least ${t.image.minWidth} × ${t.image.minHeight} pixels so it stays sharp.`,
    );
  }
  const max = image.gif ? t.maxBytes.gif : t.maxBytes.image;
  if (image.bytes > max) {
    problems.push(
      `This ${image.gif ? 'GIF' : 'picture'} is too big (${mb(image.bytes)}). The limit is ${mb(max)}.`,
    );
  }
  return problems;
}

const mb = (bytes: number) => `${(bytes / 1_000_000).toFixed(1)} MB`;

/** Problems with an ad's text for a template (empty when it fits). */
export function checkAdText(
  template: AdTemplateKind,
  text: { headline: string; body?: string | null },
): string[] {
  const t = AD_TEMPLATES[template];
  const problems: string[] = [];
  const headline = text.headline.trim();
  if (!headline) problems.push('Add a headline.');
  if (headline.length > t.headlineMax) {
    problems.push(`Keep the headline to ${t.headlineMax} characters (it has ${headline.length}).`);
  }
  const body = (text.body ?? '').trim();
  if (t.bodyMax === 0 && body)
    problems.push(`A ${t.label.toLowerCase()} has no room for more text.`);
  if (t.bodyMax > 0 && body.length > t.bodyMax) {
    problems.push(`Keep the text to ${t.bodyMax} characters (it has ${body.length}).`);
  }
  return problems;
}

// ───────────────────────────── Schedule ─────────────────────────────

export interface AdSchedule {
  startsAt: Date | null;
  endsAt: Date | null;
  /** Bit 0 = Sunday … bit 6 = Saturday (127 = every day). */
  daysOfWeek: number;
  /** Jacksonville local minutes since midnight; both null = all day. */
  dailyStartMin: number | null;
  dailyEndMin: number | null;
}

const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const formatter = new Intl.DateTimeFormat('en-US', {
  timeZone: AD_TIME_ZONE,
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** Jacksonville weekday (0 = Sunday) and minutes since midnight at `at`. */
export function jacksonvilleClock(at: Date): { weekday: number; minute: number } {
  const parts = Object.fromEntries(formatter.formatToParts(at).map((p) => [p.type, p.value]));
  return {
    weekday: WEEKDAY[parts.weekday!]!,
    minute: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

const onDay = (mask: number, weekday: number) => (mask & (1 << weekday)) !== 0;

/**
 * Whether the schedule shows the ad at `now`. A daily window that runs past midnight
 * (for example 10 pm to 2 am) belongs to the day it starts: "Fridays 10 pm–2 am" covers
 * Saturday 1 am, not Friday 1 am.
 */
export function inSchedule(s: AdSchedule, now: Date): boolean {
  if (s.startsAt && now < s.startsAt) return false;
  if (s.endsAt && now >= s.endsAt) return false;
  const { weekday, minute } = jacksonvilleClock(now);
  if (s.dailyStartMin === null || s.dailyEndMin === null) return onDay(s.daysOfWeek, weekday);
  const start = s.dailyStartMin;
  const end = s.dailyEndMin;
  if (start < end) return onDay(s.daysOfWeek, weekday) && minute >= start && minute < end;
  // Overnight: the evening part is today's window, the early-morning part is yesterday's.
  if (minute >= start) return onDay(s.daysOfWeek, weekday);
  if (minute < end) return onDay(s.daysOfWeek, (weekday + 6) % 7);
  return false;
}

export type AdDisplayState = 'DRAFT' | 'PENDING_REVIEW' | 'SCHEDULED' | 'LIVE' | 'PAUSED' | 'ENDED';

/**
 * D171: what the owner sees. Stored states stay as they are, except an APPROVED ad is
 * "Scheduled" before its start, "Live" during its dates, and "Ended" after them.
 */
export function adDisplayState(
  ad: { status: AdStatusKind; startsAt: Date | null; endsAt: Date | null },
  now: Date,
): AdDisplayState {
  if (ad.status !== 'APPROVED') return ad.status;
  if (ad.endsAt && now >= ad.endsAt) return 'ENDED';
  if (ad.startsAt && now < ad.startsAt) return 'SCHEDULED';
  return 'LIVE';
}

/**
 * D177: the ads that take one of the plan's live slots. Live ads, and scheduled ones too,
 * since they'll go live without anyone pressing a button (counting them stops a business
 * from lining up more than its plan allows). Paused, ended and unapproved ads don't.
 */
export function takesPlanSlot(
  ad: { status: AdStatusKind; startsAt: Date | null; endsAt: Date | null },
  now: Date,
): boolean {
  const state = adDisplayState(ad, now);
  return state === 'LIVE' || state === 'SCHEDULED';
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "every day", "Tue–Fri", "Mon, Wed, Fri" (runs of 3+ days are shortened). */
export function describeDays(mask: number): string {
  if ((mask & 127) === 127) return 'every day';
  if (mask === 0b0111110) return 'weekdays';
  if (mask === 0b1000001) return 'weekends';
  const days = DAY_NAMES.map((_, i) => i).filter((i) => onDay(mask, i));
  const parts: string[] = [];
  for (let i = 0; i < days.length;) {
    let j = i;
    while (j + 1 < days.length && days[j + 1] === days[j]! + 1) j++;
    if (j - i >= 2) parts.push(`${DAY_NAMES[days[i]!]}–${DAY_NAMES[days[j]!]}`);
    else for (let k = i; k <= j; k++) parts.push(DAY_NAMES[days[k]!]!);
    i = j + 1;
  }
  return parts.join(', ');
}

/** "4:00 pm" from minutes since midnight (1440 = "midnight"). */
export function describeMinute(m: number): string {
  if (m === 0 || m === 1440) return 'midnight';
  if (m === 720) return 'noon';
  const h = Math.floor(m / 60);
  const min = String(m % 60).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${min} ${h < 12 ? 'am' : 'pm'}`;
}

/** "Tue–Fri, 4:00 pm–7:00 pm" or "every day, all day". */
export function describeSchedule(
  s: Pick<AdSchedule, 'daysOfWeek' | 'dailyStartMin' | 'dailyEndMin'>,
): string {
  const days = describeDays(s.daysOfWeek);
  if (s.dailyStartMin === null || s.dailyEndMin === null) return `${days}, all day`;
  return `${days}, ${describeMinute(s.dailyStartMin)}–${describeMinute(s.dailyEndMin)}`;
}

// ───────────────────────────── Targeting ─────────────────────────────

export interface AdTargeting {
  radiusMeters: number | null;
  zips: string[];
  /** D204: shown to everyone in the area (Premium). */
  cityWide?: boolean;
}

export interface LatLng {
  latitude: number;
  longitude: number;
}

/** Great-circle distance in meters (good to a few meters at city scale). */
export function metersBetween(a: LatLng, b: LatLng): number {
  const R = 6_371_000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * D166: whether an ad is meant for this reader, judged only by the location reading the
 * feed request already carries (never the page being viewed, never anything personal).
 * A reader inside the radius around the place, or in one of the chosen ZIP codes, sees it.
 * An ad with neither isn't targeted at anyone (the editor requires one). D204: a city-wide
 * ad reaches every reader (the feed request already proves they're in the area).
 */
export function targetsReader(
  ad: AdTargeting,
  place: LatLng,
  reader: { point: LatLng; zip: string | null },
): boolean {
  if (ad.cityWide) return true;
  if (ad.radiusMeters !== null && metersBetween(place, reader.point) <= ad.radiusMeters)
    return true;
  return reader.zip !== null && ad.zips.includes(reader.zip);
}

// ───────────────────────────── Mixing into a feed ─────────────────────────────

/**
 * D166/D167: where ads go in one page of posts: after every `everyN` posts (never before
 * the first post, never two in a row). Returns the post counts after which an ad goes:
 * with 30 posts and everyN 8, ads follow posts 8, 16 and 24.
 */
export function adSlots(postCount: number, everyN: number): number[] {
  const n = Math.max(2, Math.floor(everyN));
  const slots: number[] = [];
  for (let after = n; after < postCount; after += n) slots.push(after);
  return slots;
}

/** Small, fast, seeded random numbers (mulberry32), so a page shuffles the same way twice. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A number from a string (for seeds such as "reader + page"). */
export function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}

/**
 * Picks up to `count` ads for one list, fairly: shuffled with the seed, then at most one
 * per business (D167). The same seed gives the same picks, so reloading a page doesn't
 * reshuffle it; a new page or a new day gives others a turn.
 */
export function chooseAds<T extends { id: string; businessId: string }>(
  candidates: T[],
  count: number,
  seed: number,
): T[] {
  const rand = seeded(seed);
  const pool = [...candidates].sort((a, b) => a.id.localeCompare(b.id));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  const seen = new Set<string>();
  const picked: T[] = [];
  for (const ad of pool) {
    if (picked.length >= count) break;
    if (seen.has(ad.businessId)) continue;
    seen.add(ad.businessId);
    picked.push(ad);
  }
  return picked;
}

/**
 * Puts the chosen ads into the page at their slots. Returns posts and ads in reading
 * order, each tagged, so the server sends one list and the phone can't move or drop ads.
 */
export function mixAds<P, A>(
  posts: P[],
  ads: A[],
  everyN: number,
): ({ kind: 'post'; item: P } | { kind: 'ad'; item: A })[] {
  const slots = adSlots(posts.length, everyN);
  const out: ({ kind: 'post'; item: P } | { kind: 'ad'; item: A })[] = [];
  let next = 0;
  posts.forEach((post, i) => {
    out.push({ kind: 'post', item: post });
    if (slots.includes(i + 1) && next < ads.length) out.push({ kind: 'ad', item: ads[next++]! });
  });
  return out;
}
