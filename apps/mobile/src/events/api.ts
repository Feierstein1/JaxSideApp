import type {
  ChatLine,
  EventChatList,
  EventChatStatus,
  EventDay,
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

export async function fetchMonth(month: string, f: Filters) {
  const reading = await getFreshReading();
  return api.post<EventMonth>('/api/v1/events/month', { reading, month, ...active(f) });
}

export async function fetchDay(date: string, f: Filters) {
  const reading = await getFreshReading();
  return api.post<EventDay>('/api/v1/events/day', { reading, date, ...active(f) });
}

export async function fetchList(f: Filters, cursor?: string) {
  const reading = await getFreshReading();
  return api.post<EventPage>('/api/v1/events/list', {
    reading,
    ...active(f),
    ...(cursor ? { cursor } : {}),
  });
}

export async function fetchEvent(id: string) {
  const reading = await getFreshReading();
  return (await api.post<{ event: EventDetail }>(`/api/v1/events/${id}`, { reading })).event;
}

export const setEventFollow = (id: string, follow: boolean) =>
  follow
    ? api.put<{ following: boolean; followerCount: number | null }>(`/api/v1/events/${id}/follow`)
    : api.delete<{ following: boolean; followerCount: number | null }>(
        `/api/v1/events/${id}/follow`,
      );

/** D236: the event's link button was used (after "You're leaving JaxSide"). */
export function eventLinkTapped(id: string) {
  return api.post(`/api/v1/events/${id}/tap`, {}).catch(() => undefined);
}

/** The filters' starting point, and how many are on (for the Filters button's badge). */
export const NO_FILTERS: Filters = { kind: 'all' };
export const filterCount = (f: Filters) =>
  [f.nearby, f.kind !== 'all', f.setting, f.freeOnly, f.following].filter(Boolean).length;

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
