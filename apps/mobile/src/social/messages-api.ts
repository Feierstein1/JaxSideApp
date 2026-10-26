import type { ChatMessage, ConversationSummary, FriendUser } from '@jax/shared';
import { api } from '@/api';
import { getFreshReading } from '@/location/device';

/** D98: private messages (mutual friends only). */
export const messagesApi = {
  list: () => api.get<{ conversations: ConversationSummary[] }>('/api/v1/messages'),
  chat: (username: string, before?: string) =>
    api.get<{
      with: FriendUser;
      canSend: boolean;
      messages: ChatMessage[];
      nextBefore: string | null;
    }>(
      `/api/v1/messages/with/${encodeURIComponent(username)}${
        before ? `?before=${encodeURIComponent(before)}` : ''
      }`,
    ),
  send: async (to: string, body: string, photoIds: string[], confirmWarning?: true) => {
    const reading = await getFreshReading();
    return api.post<{ message: ChatMessage }>('/api/v1/messages', {
      reading,
      to,
      body,
      ...(photoIds.length ? { photoIds } : {}),
      ...(confirmWarning ? { confirmWarning } : {}),
    });
  },
  unsend: (id: string) => api.post(`/api/v1/messages/${id}/unsend`, {}),
  hide: (id: string) => api.post(`/api/v1/messages/${id}/hide`, {}),
  hideChat: (conversationId: string) =>
    api.post(`/api/v1/messages/conversations/${conversationId}/hide`, {}),
};
