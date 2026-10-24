import type { PollView } from '@jax/shared';
import { api } from '@/api';
import { getFreshReading } from '@/location/device';

/** D123: weekly polls. */
export const fetchPolls = () => api.get<{ open: PollView[]; closed: PollView[] }>('/api/v1/polls');

export const fetchPoll = async (id: string) =>
  (await api.get<{ poll: PollView }>(`/api/v1/polls/${id}`)).poll;

/** One final vote, with a fresh location reading (inside Duval). */
export async function votePoll(id: string, choiceId: string) {
  const reading = await getFreshReading({ fresh: true });
  return (await api.post<{ poll: PollView }>(`/api/v1/polls/${id}/vote`, { reading, choiceId }))
    .poll;
}

/** "Closes Sunday 9:00 AM" / "Closed Oct 26". */
export function pollWhen(p: PollView, now = new Date()) {
  const at = new Date(p.status === 'upcoming' ? p.opensAt : p.closesAt);
  const soon = at.getTime() - now.getTime() < 6 * 86_400_000 && at > now;
  const text = soon
    ? at.toLocaleString('en-US', { weekday: 'long', hour: 'numeric', minute: '2-digit' })
    : at.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return p.status === 'closed' ? `Closed ${text}` : `Closes ${text}`;
}
