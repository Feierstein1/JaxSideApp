import type { ChatLine, ChatRoomInfo, ChatStatus } from '@jax/shared';
import { api } from '@/api';
import { getFreshReading } from '@/location/device';

/** D218: area chat. The room is chosen by the server from your location, never by the app. */
export interface ChatList {
  lines: ChatLine[];
  room: ChatRoomInfo;
  people: string;
  mutedUntil: string | null;
}

export const chat = {
  status: async () =>
    api.post<ChatStatus>('/api/v1/chat/status', { reading: await getFreshReading() }),
  list: async (after?: string) =>
    api.post<ChatList>('/api/v1/chat/messages/list', {
      reading: await getFreshReading(),
      ...(after ? { after } : {}),
    }),
  send: async (body: string) =>
    api.post<{ line: ChatLine }>('/api/v1/chat/messages', {
      reading: await getFreshReading(),
      body,
    }),
};

/** "2:41 PM" for a chat line. */
export const chatClock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
