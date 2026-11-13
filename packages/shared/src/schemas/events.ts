import { z } from 'zod';
import { isValidDate, MONTH_RE, TIME_RE, type SessionInput } from '../event-time';
import type { ChatLine } from './chat';
import { locationReadingSchema } from './location';

/*
 * D230: events and the event calendar. An event has one or more sessions (a date, a start and
 * an end, Jacksonville time), a place or an address with a pin inside Duval, and is reviewed
 * by JaxSide before anyone sees it. The website (JaxSideBusiness) creates business and
 * organizer events with `eventInputSchema`; the admin portal uses the same shape.
 */

export const EVENT_CATEGORIES = {
  music: 'Music',
  food: 'Food & drink',
  arts: 'Arts & culture',
  sports: 'Sports & watch parties',
  trivia: 'Trivia & games',
  nightlife: 'Nightlife',
  market: 'Markets',
  festival: 'Festivals',
  family: 'Family',
  outdoors: 'Outdoors & fitness',
  community: 'Community',
  other: 'Other',
} as const;
export type EventCategory = keyof typeof EVENT_CATEGORIES;
const categoryKeys = Object.keys(EVENT_CATEGORIES) as [EventCategory, ...EventCategory[]];

export const EVENT_SETTINGS = {
  indoor: 'Indoor',
  outdoor: 'Outdoor',
  mixed: 'Indoor & outdoor',
} as const;
export type EventSetting = keyof typeof EVENT_SETTINGS;
const settingKeys = Object.keys(EVENT_SETTINGS) as [EventSetting, ...EventSetting[]];

/** Who puts the event on: a business at its place, an event organizer, or the community. */
export const EVENT_HOST_KINDS = ['community', 'business', 'organizer'] as const;
export type EventHostKind = (typeof EVENT_HOST_KINDS)[number];

export const EVENT_TITLE_MAX = 100;
export const EVENT_DESCRIPTION_MAX = 2000;
export const EVENT_VENUE_MAX = 120;
export const EVENT_ADDRESS_MAX = 300;
export const EVENT_PRICE_MAX = 60;
/** Sessions per event (a weekly event for a year is 52). */
export const EVENT_SESSIONS_MAX = 60;
/** Pictures per event. */
export const EVENT_IMAGES_MAX = 6;
/** The event area for its chat: a circle around the pin. */
export const EVENT_CHAT_RADIUS = { min: 50, default: 150, max: 1600 } as const;
/** A session may last at most a day (longer events are several sessions). */
export const EVENT_SESSION_MAX_HOURS = 24;
/** Events per page in the list view. */
export const EVENT_PAGE_SIZE = 20;

const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const eventSessionSchema = z.strictObject({
  date: z.string().refine(isValidDate, 'Use a real date (YYYY-MM-DD)'),
  start: z.string().regex(TIME_RE, 'Use a 24-hour time like 19:30'),
  /** At or before the start = the next day (a show that runs past midnight). */
  end: z.string().regex(TIME_RE, 'Use a 24-hour time like 22:00'),
});

const sessionsSchema = z
  .array(eventSessionSchema)
  .min(1, 'Add at least one date')
  .max(EVENT_SESSIONS_MAX, `At most ${EVENT_SESSIONS_MAX} dates`)
  .refine(
    (list) => new Set(list.map((s) => `${s.date} ${s.start}`)).size === list.length,
    'The same date and start time is listed twice',
  );

/**
 * D230: an event as an admin or a business types it. A place (its pin and address come from
 * the place) or a pin with an optional address; the server checks the pin is inside Duval.
 * D236: `placeId` is where it's held (any place on JaxSide); a business event also names its
 * own place as the host (`hostPlaceId`; it defaults to `placeId`, the D230 shape), so a
 * business can hold an event elsewhere (another place, or a pin and address).
 */
export const eventInputSchema = z
  .strictObject({
    title: text(3, EVENT_TITLE_MAX),
    description: text(1, EVENT_DESCRIPTION_MAX),
    category: z.enum(categoryKeys),
    hostKind: z.enum(EVENT_HOST_KINDS).default('community'),
    setting: z.enum(settingKeys),
    free: z.boolean(),
    /** "$10", "$15–25", "Tickets at the door". */
    priceText: text(1, EVENT_PRICE_MAX).optional(),
    adultsOnly: z.boolean().default(false),
    familyFriendly: z.boolean().default(false),
    placeId: z.uuid().optional(),
    /** D236: a business event's own place (the host); defaults to `placeId`. */
    hostPlaceId: z.uuid().optional(),
    venueName: text(1, EVENT_VENUE_MAX).optional(),
    address: text(3, EVENT_ADDRESS_MAX).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    chatRadiusMeters: z
      .int()
      .min(EVENT_CHAT_RADIUS.min)
      .max(EVENT_CHAT_RADIUS.max)
      .default(EVENT_CHAT_RADIUS.default),
    sessions: sessionsSchema,
    /** D236 (D216 rules): a ticket or info link, paid plans only. The website checks it further. */
    linkUrl: z
      .string()
      .trim()
      .max(500)
      .startsWith('https://', 'Links start with https://')
      .nullable()
      .default(null),
    linkLabel: z.string().trim().min(2).max(25).nullable().default(null),
  })
  .refine((e) => (e.latitude === undefined) === (e.longitude === undefined), {
    message: 'Give both latitude and longitude',
    path: ['latitude'],
  })
  .refine((e) => !!e.placeId || e.latitude !== undefined, {
    message: 'Pick a place or set a pin',
    path: ['placeId'],
  })
  .refine((e) => e.hostKind !== 'business' || !!(e.hostPlaceId ?? e.placeId), {
    message: 'A business event names the business’s place',
    path: ['hostPlaceId'],
  })
  .refine((e) => e.hostKind === 'business' || !e.hostPlaceId, {
    message: 'Only a business event has a host place',
    path: ['hostPlaceId'],
  })
  .refine((e) => (e.linkUrl === null) === (e.linkLabel === null), {
    message: 'A link needs its button text, and button text needs a link',
    path: ['linkLabel'],
  })
  .refine((e) => !e.free || !e.priceText, {
    message: 'A free event has no price',
    path: ['priceText'],
  });
export type EventInput = z.input<typeof eventInputSchema>;
export type EventInputParsed = z.infer<typeof eventInputSchema>;

/** The Events tab's filters (search, where, who, setting, cost, followed). */
export const eventFiltersShape = {
  q: z.string().trim().max(60).optional(),
  /** Within `events.nearbyMiles` of you; otherwise all of Duval. */
  nearby: z.boolean().optional(),
  kind: z.enum(['all', 'community', 'business']).default('all'),
  setting: z.enum(['indoor', 'outdoor']).optional(),
  freeOnly: z.boolean().optional(),
  following: z.boolean().optional(),
};
export const eventFiltersSchema = z.strictObject(eventFiltersShape);
export type EventFilters = z.input<typeof eventFiltersSchema>;

/** The calendar: how many events on each day of a month. */
export const eventMonthSchema = z.strictObject({
  reading: locationReadingSchema,
  month: z.string().regex(MONTH_RE, 'Use YYYY-MM'),
  ...eventFiltersShape,
});

/** One day's events, grouped by neighborhood. */
export const eventDaySchema = z.strictObject({
  reading: locationReadingSchema,
  date: z.string().refine(isValidDate, 'Use a real date (YYYY-MM-DD)'),
  ...eventFiltersShape,
});

/** The list view: upcoming sessions, soonest first. */
export const eventListSchema = z.strictObject({
  reading: locationReadingSchema,
  cursor: z.string().max(200).optional(),
  limit: z.int().min(1).max(EVENT_PAGE_SIZE).default(EVENT_PAGE_SIZE),
  ...eventFiltersShape,
});

/** Opening an event page (the reading proves you're in Duval). */
export const eventReadSchema = z.strictObject({ reading: locationReadingSchema });

// ───────────────────────────── Admin ─────────────────────────────

const reasonText = z.string().trim().min(3, 'Give a short reason').max(300);

export const adminEventDecisionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('approve') }),
  z.strictObject({ action: z.literal('deny'), reason: reasonText }),
  z.strictObject({ action: z.literal('cancel'), reason: reasonText }),
  z.strictObject({ action: z.literal('remove'), reason: reasonText }),
  z.strictObject({ action: z.literal('restore') }),
]);
export type AdminEventDecision = z.infer<typeof adminEventDecisionSchema>;

/** Copy an event: as it is (to edit), or with every date a year later. */
export const adminEventCopySchema = z.strictObject({ years: z.int().min(0).max(1).default(0) });

/**
 * D230 / D237: organizers don't wait for JaxSide. `approve` is a check mark ("we checked
 * them"; it also reopens a closed one); `reject` closes an organizer, new or checked, with a
 * note the website shows (no new events, no sending).
 */
export const adminOrganizerDecisionSchema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('approve') }),
  z.strictObject({ action: z.literal('reject'), note: z.string().trim().min(3).max(500) }),
]);

/** Find a pin for an address (US Census geocoder, D224). */
export const geocodeSchema = z.strictObject({ address: text(5, EVENT_ADDRESS_MAX) });

// ───────────────────────────── Answers ─────────────────────────────

export interface EventHost {
  kind: EventHostKind;
  /** The business (its place's name) or the organizer; null for community events. */
  name: string | null;
  /** Business events: the place, so the app can show its category icon and open it. */
  placeId: string | null;
  placeCategory: string | null;
}

/** D240: a place an event is held at (its icon comes from the category). */
export interface EventVenuePlace {
  placeId: string;
  name: string;
  category: string;
}

/** One session of an event, as the lists show it. */
export interface EventCard {
  id: string;
  sessionId: string;
  title: string;
  category: EventCategory;
  /** ISO instants, and the same in Jacksonville time for display. */
  startsAt: string;
  endsAt: string;
  date: string;
  startTime: string;
  endTime: string;
  /** "Day 2 of 3" for events with several sessions on different days. */
  dayNumber: number;
  dayCount: number;
  /** Venue name, the place's name, or the address. */
  venue: string | null;
  /**
   * D236: the venue place's name once its owner confirmed the event is held there ("Confirmed
   * by …"); null otherwise (and the place isn't named at all while its owner disputes it).
   */
  venueConfirmedBy: string | null;
  /**
   * D240: the business the event is held at, once its owner confirmed it (D236) and when it
   * isn't the event's own host (an organizer's event at a bar): shown as "Hosted at [place]"
   * with its icon; tapping it opens the place's discussion (if you're close enough).
   */
  hostedAt: EventVenuePlace | null;
  neighborhood: string | null;
  zip: string | null;
  setting: EventSetting;
  free: boolean;
  priceText: string | null;
  adultsOnly: boolean;
  familyFriendly: boolean;
  host: EventHost;
  /** The first picture (a signed link that works for an hour), if any. */
  imageUrl: string | null;
  following: boolean;
  cancelled: boolean;
  /** Started and not yet over. */
  happeningNow: boolean;
  /** Miles from the reader, one decimal. */
  distanceMiles: number;
}

export interface EventMonth {
  month: string;
  /** Today in Jacksonville (the square to highlight). */
  today: string;
  /** 'YYYY-MM-DD' → number of events that day (days with none are left out). */
  days: Record<string, number>;
}

export interface EventDayGroup {
  neighborhood: string | null;
  zip: string | null;
  events: EventCard[];
}

export interface EventDay {
  date: string;
  today: string;
  groups: EventDayGroup[];
}

export interface EventPage {
  items: EventCard[];
  nextCursor: string | null;
}

export interface EventImageView {
  id: string;
  url: string;
  width: number;
  height: number;
}

export interface EventSessionView {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  startsAt: string;
  endsAt: string;
}

export interface EventDetail extends EventCard {
  description: string;
  address: string | null;
  latitude: number;
  longitude: number;
  /** Sessions that haven't ended (the next one first). */
  sessions: EventSessionView[];
  images: EventImageView[];
  /** Shown from 10 followers (`events.followerCountMin`); null below that. */
  followerCount: number | null;
  /** D236: the host's link button, while its plan allows links (`ads.links`). */
  link: { url: string; label: string } | null;
}

/** Helpers for forms: a blank session to start from. */
export const blankSession = (date: string): SessionInput => ({
  date,
  start: '18:00',
  end: '21:00',
});

// ───────────────────────────── Event chat ─────────────────────────────

/**
 * D230: where you stand with an event's chat right now.
 * - closed: it isn't open (more than an hour before, or over 2 hours after)
 * - away: it's open, but you aren't inside the event area
 * - ask: you're there: show "Are you at [event]?"
 * - joined: you said yes (and you're still there)
 */
export interface EventChatStatus {
  state: 'closed' | 'away' | 'ask' | 'joined';
  /** The session the chat is for (null when closed and none is coming up). */
  sessionId: string | null;
  opensAt: string | null;
  closesAt: string | null;
  /** "a few" under 5, the number from 5 (people who said they're there). */
  people: string | null;
  mutedUntil: string | null;
}

/** An organizer's update, pinned at the top of the chat. */
export interface EventChatUpdate {
  id: string;
  body: string;
  createdAt: string;
}

export interface EventChatList {
  lines: ChatLine[];
  updates: EventChatUpdate[];
  people: string;
  mutedUntil: string | null;
  closesAt: string;
}

/**
 * D230: phrases refused in event chat, so a false alarm can't spread through a crowd. The
 * person is told to call 911 if it's real. Matched on whole words, any case.
 */
export const EVENT_CHAT_ALARM_PHRASES = [
  'shots fired',
  'shooter',
  'shooting',
  'gunman',
  'gun',
  'guns',
  'bomb',
  'stampede',
  'evacuate',
  'stabbing',
  'stabbed',
  'terrorist',
  'explosion',
] as const;

/** True when a line contains one of the alarm phrases. */
export function hasAlarmPhrase(text: string): boolean {
  const words = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ')} `;
  return EVENT_CHAT_ALARM_PHRASES.some((p) => words.includes(` ${p} `));
}
