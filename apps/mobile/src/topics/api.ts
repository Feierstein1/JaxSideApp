import type {
  CreateTopicRequest,
  FeedSort,
  PostTypeFilter,
  TopicListRequest,
  TopicPage,
  TopicView,
} from '@jax/shared';
import { api } from '@/api';
import { cached, invalidate, MINUTE } from '@/cache';
import type { PostPage } from '@/discussion/api';
import type { HeldResponse } from '@/discussion/screening';
import { getFreshReading } from '@/location/device';

/** D125: citywide topics. */
export const fetchTopics = () =>
  api.get<{ open: TopicView[]; closed: TopicView[] }>('/api/v1/topics');

/** A topic's posts (citywide; the reading only proves you're in Duval). */
export async function fetchTopicPosts(
  id: string,
  sort: FeedSort,
  cursor?: string,
  type: PostTypeFilter = 'all',
) {
  const reading = await getFreshReading();
  return api.post<PostPage & { topic: TopicView }>(`/api/v1/topics/${id}/posts/list`, {
    reading,
    sort,
    ...(cursor ? { cursor } : {}),
    ...(type !== 'all' ? { type } : {}),
  });
}

/**
 * D133: one page of topics of one kind (city or local), newest or oldest first, with
 * optional search, category and Following filters. Local topics need you nearby.
 */
export function fetchTopicPage(
  params: Omit<TopicListRequest, 'reading'>,
  force = false,
): Promise<TopicPage> {
  const load = async () => {
    const reading = await getFreshReading();
    return api.post<TopicPage>('/api/v1/topics/list', { reading, ...params });
  };
  // D259: a first page of city topics is kept 2 minutes (see `@/cache`). Local topics depend on
  // where you are, and searches and "load more" pages are one-offs, so those always ask.
  const keep = params.scope === 'city' && !params.cursor && !params.q;
  return keep ? cached(`topics:page:${JSON.stringify(params)}`, 2 * MINUTE, load, force) : load();
}

/**
 * D133: start a topic (city, or local at where you are now). D142: a topic screening holds
 * comes back as `{ held, message }` (saved, hidden until a moderator reviews it).
 */
export async function createTopic(input: Omit<CreateTopicRequest, 'reading'>) {
  const reading = await getFreshReading({ fresh: true });
  const r = await api.post<{ topic: TopicView } | HeldResponse>('/api/v1/topics', {
    reading,
    ...input,
  });
  invalidate('topics:');
  return r;
}

/** D134: show or hide your username on a topic you started (the only change allowed). */
export const setShowCreator = async (id: string, show: boolean) =>
  (
    await api
      .patch<{ topic: TopicView }>(`/api/v1/topics/${id}`, { showCreator: show })
      .finally(() => invalidate('topics:'))
  ).topic;

/** D134: delete a topic you started (hidden at once; gone for good after a week). */
export const deleteTopic = (id: string) =>
  api.delete<{ ok: true }>(`/api/v1/topics/${id}`).finally(() => invalidate('topics:'));

/** D133: follow or unfollow a topic. */
export const setFollow = (id: string, follow: boolean) =>
  (follow
    ? api.put<{ following: boolean; followerCount: number }>(`/api/v1/topics/${id}/follow`)
    : api.delete<{ following: boolean; followerCount: number }>(`/api/v1/topics/${id}/follow`)
  ).finally(() => invalidate('topics:'));

/** "Oct 25" (this year) or "Oct 25, 2025". */
export function topicDate(iso: string, now = new Date()) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
}

/** "Active 5 min ago" / "No posts yet". */
export function topicActivity(t: TopicView, now = Date.now()) {
  if (!t.lastPostAt) return 'No posts yet';
  const mins = Math.max(1, Math.round((now - Date.parse(t.lastPostAt)) / 60_000));
  const ago =
    mins < 60
      ? `${mins} min`
      : mins < 1440
        ? `${Math.round(mins / 60)} h`
        : `${Math.round(mins / 1440)} d`;
  return `${t.postCount} ${t.postCount === 1 ? 'post' : 'posts'} · active ${ago} ago`;
}
