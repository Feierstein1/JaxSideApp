import { cached, invalidate, MINUTE } from '@/cache';
import type {
  EventCard,
  ChatLine,
  EventChatList,
  EventChatStatus,
  EventDay,
  EventAreas,
  EventDetail,
  EventFilters,
  EventMonth,
  EventPage,
} from '@jax/shared';
import { api } from '@/api';
import { getFreshReading } from '@/location/device';

/*
 * D230: the Events tab. Every read carries a fresh reading (events are for people in Duval,
 * D16); the server also uses it for Nearby and to put your neighborhood first.
 */

/** The filters the tab sends (search, nearby, who, setting, cost, followed). */
export type Filters = Omit<EventFilters, 'kind'> & { kind: 'all' | 'community' | 'business' };

/** Only the filters that are on (keeps requests small). */
function active(f: Filters) {
  return {
    ...(f.q?.trim() ? { q: f.q.trim() } : {}),
    ...(f.nearby ? { nearby: true } : {}),
    ...(f.kind !== 'all' ? { kind: f.kind } : {}),
    ...(f.setting ? { setting: f.setting } : {}),
    ...(f.freeOnly ? { freeOnly: true } : {}),
    ...(f.following ? { following: true } : {}),
  };
}

/** D259: the event lists are kept a couple of minutes (see `@/cache`); following one clears them. */
const EVENTS_TTL = 2 * MINUTE;

export function fetchMonth(month: string, f: Filters, force = false) {
  return cached(
    `events:month:${month}:${JSON.stringify(active(f))}`,
    EVENTS_TTL,
    async () => {
      const reading = await getFreshReading();
      return api.post<EventMonth>('/api/v1/events/month', { reading, month, ...active(f) });
    },
    force,
  );
}

export function fetchDay(date: string, f: Filters, force = false) {
  return cached(
    `events:day:${date}:${JSON.stringify(active(f))}`,
    EVENTS_TTL,
    async () => {
      const reading = await getFreshReading();
      return api.post<EventDay>('/api/v1/events/day', { reading, date, ...active(f) });
    },
    force,
  );
}

export function fetchList(f: Filters, cursor?: string, force = false) {
  const load = async () => {
    const reading = await getFreshReading();
    return api.post<EventPage>('/api/v1/events/list', {
      reading,
      ...active(f),
      ...(cursor ? { cursor } : {}),
    });
  };
  // Only the first page is kept; "Load more" always asks.
  return cursor
    ? load()
    : cached(`events:list:${JSON.stringify(active(f))}`, EVENTS_TTL, load, force);
}

export async function fetchEvent(id: string) {
  const reading = await getFreshReading();
  return (await api.post<{ event: EventDetail }>(`/api/v1/events/${id}`, { reading })).event;
}

export const setEventFollow = (id: string, follow: boolean) =>
  (follow
    ? api.put<{ following: boolean; followerCount: number | null }>(`/api/v1/events/${id}/follow`)
    : api.delete<{ following: boolean; followerCount: number | null }>(
        `/api/v1/events/${id}/follow`,
      )
  ).finally(() => invalidate('events:')); // follow changes Coming up, the Following filter, counts

/** D236: the event's link button was used (after "You're leaving JaxSide"). */
export function eventLinkTapped(id: string) {
  return api.post(`/api/v1/events/${id}/tap`, {}).catch(() => undefined);
}

/** The filters' starting point, and how many are on (for the Filters button's badge). */
export const NO_FILTERS: Filters = { kind: 'all' };
export const filterCount = (f: Filters) =>
  [
    f.nearby || f.neighborhood || f.zip,
    f.kind !== 'all',
    f.setting,
    f.freeOnly,
    f.following,
  ].filter(Boolean).length;

/** D248: neighborhoods and ZIPs with events to come (the "Where" filter's choices). */
export async function fetchAreas() {
  const reading = await getFreshReading();
  return api.post<EventAreas>('/api/v1/events/areas', { reading });
}

/** D230: the event's chat. The server checks you're at the event on every call. */
export const eventChat = {
  status: async (id: string) =>
    api.post<EventChatStatus>(`/api/v1/events/${id}/chat/status`, {
      reading: await getFreshReading(),
    }),
  join: async (id: string) =>
    api.post<{ joined: true; people: string }>(`/api/v1/events/${id}/chat/join`, {
      reading: await getFreshReading({ fresh: true }),
    }),
  list: async (id: string, after?: string) =>
    api.post<EventChatList>(`/api/v1/events/${id}/chat/list`, {
      reading: await getFreshReading(),
      ...(after ? { after } : {}),
    }),
  send: async (id: string, body: string) =>
    api.post<{ line: ChatLine }>(`/api/v1/events/${id}/chat`, {
      reading: await getFreshReading(),
      body,
    }),
};

/** D241: followed events that start today or tomorrow ("Coming up"). Accounts only. */
/** D248: boosted events for the Featured section (guests too). */
export function fetchFeatured(force = false) {
  return cached(
    'events:featured',
    5 * MINUTE,
    async () => {
      const reading = await getFreshReading();
      return (await api.post<{ events: EventCard[] }>('/api/v1/events/featured', { reading }))
        .events;
    },
    force,
  );
}

export function fetchComingUp(force = false) {
  return cached(
    'events:comingUp',
    EVENTS_TTL,
    async () => {
      const reading = await getFreshReading();
      return (await api.post<{ events: EventCard[] }>('/api/v1/events/coming-up', { reading }))
        .events;
    },
    force,
  );
}
