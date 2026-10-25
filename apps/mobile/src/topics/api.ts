import type {
  CreateTopicRequest,
  FeedSort,
  PostTypeFilter,
  TopicListRequest,
  TopicPage,
  TopicView,
} from '@jax/shared';
import { api } from '@/api';
import type { PostPage } from '@/discussion/api';
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
export async function fetchTopicPage(
  params: Omit<TopicListRequest, 'reading'>,
): Promise<TopicPage> {
  const reading = await getFreshReading();
  return api.post<TopicPage>('/api/v1/topics/list', { reading, ...params });
}

/** D133: start a topic (city, or local at where you are now). */
export async function createTopic(input: Omit<CreateTopicRequest, 'reading'>) {
  const reading = await getFreshReading({ fresh: true });
  return (await api.post<{ topic: TopicView }>('/api/v1/topics', { reading, ...input })).topic;
}

/** D133: follow or unfollow a topic. */
export const setFollow = (id: string, follow: boolean) =>
  follow
    ? api.put<{ following: boolean; followerCount: number }>(`/api/v1/topics/${id}/follow`)
    : api.delete<{ following: boolean; followerCount: number }>(`/api/v1/topics/${id}/follow`);

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
