import type { PollTopic, PollView } from '@jax/shared';
import { api } from '@/api';
import { getFreshReading } from '@/location/device';

/** D123 / D124: weekly polls, optionally one topic. */
export const fetchPolls = (topic?: PollTopic) =>
  api.get<{ open: PollView[]; closed: PollView[] }>(
    `/api/v1/polls${topic ? `?topic=${topic}` : ''}`,
  );

export const fetchPoll = async (id: string) =>
  (await api.get<{ poll: PollView }>(`/api/v1/polls/${id}`)).poll;

/** One final vote (one answer, or several for Pick several), with a fresh reading. */
export async function votePoll(id: string, choiceIds: string[]) {
  const reading = await getFreshReading({ fresh: true });
  return (await api.post<{ poll: PollView }>(`/api/v1/polls/${id}/vote`, { reading, choiceIds }))
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

/** How an answer reads: rating answers carry the words for 1 and 5 ("1 · Very poor"). */
export function answerLabel(p: PollView, c: PollView['choices'][number]) {
  if (p.kind !== 'scale' || !p.scale || c.value === null) return c.label;
  if (c.value === 1) return `1 · ${p.scale.low}`;
  if (c.value === 5) return `5 · ${p.scale.high}`;
  return String(c.value);
}
