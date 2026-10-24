import type {
  MyTopicSuggestion,
  PostTypeFilter,
  FeedSort,
  SuggestTopicRequest,
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

export const suggestTopic = (s: SuggestTopicRequest) =>
  api.post<{ id: string }>('/api/v1/topics/suggestions', s);

export const fetchMySuggestions = async () =>
  (await api.get<{ suggestions: MyTopicSuggestion[] }>('/api/v1/topics/suggestions')).suggestions;

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
