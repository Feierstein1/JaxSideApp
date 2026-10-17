import type { CommentView, DiscussionKind, FeedSort, PostView } from '@jax/shared';
import { api } from '@/api';
import { getFreshReading } from '@/location/device';
import type { HeldResponse } from './screening';

/**
 * Discussion requests (Phase 3). Each one carries a recent location reading; the server
 * decides who may read or write where (D16, D19, D20). Writes use a brand-new fix.
 */

export interface PostPage {
  posts: PostView[];
  nextCursor: string | null;
  /** D72: closest named neighborhood (area feed only). */
  area?: string | null;
}

const base = (kind: DiscussionKind) =>
  kind === 'general' ? '/api/v1/posts' : '/api/v1/business-posts';

export async function fetchFeed(sort: FeedSort, cursor?: string) {
  const reading = await getFreshReading();
  return api.post<PostPage>('/api/v1/feed', { reading, sort, ...(cursor ? { cursor } : {}) });
}

export async function fetchRoom(placeId: string, cursor?: string) {
  const reading = await getFreshReading();
  return api.post<PostPage>(`/api/v1/places/${placeId}/posts/list`, {
    reading,
    ...(cursor ? { cursor } : {}),
  });
}

export async function fetchPost(kind: DiscussionKind, id: string) {
  const reading = await getFreshReading();
  return api.post<{ post: PostView; comments: CommentView[] }>(`${base(kind)}/${id}`, { reading });
}

export async function createPost(
  target: { kind: 'general' } | { kind: 'business'; placeId: string },
  body: string,
  confirmWarning?: true,
  photoIds: string[] = [],
) {
  const reading = await getFreshReading({ fresh: true });
  const path =
    target.kind === 'general' ? '/api/v1/posts' : `/api/v1/places/${target.placeId}/posts`;
  return api.post<{ post: PostView } | HeldResponse>(path, {
    reading,
    body,
    confirmWarning,
    ...(photoIds.length ? { photoIds } : {}),
  });
}

export async function createComment(
  kind: DiscussionKind,
  postId: string,
  body: string,
  parentCommentId?: string,
  confirmWarning?: true,
) {
  const reading = await getFreshReading({ fresh: true });
  return api.post<{ id: string } | HeldResponse>(`${base(kind)}/${postId}/comments`, {
    reading,
    body,
    confirmWarning,
    ...(parentCommentId ? { parentCommentId } : {}),
  });
}

export interface VoteResult {
  score: number;
  upCount: number;
  downCount: number;
  myVote: -1 | 0 | 1;
}

export async function vote(
  target: { type: DiscussionKind | 'comment'; id: string },
  value: -1 | 0 | 1,
) {
  const reading = await getFreshReading();
  const path =
    target.type === 'comment'
      ? `/api/v1/comments/${target.id}/vote`
      : `${base(target.type)}/${target.id}/vote`;
  return api.put<VoteResult>(path, { reading, value });
}

export async function deletePost(kind: DiscussionKind, id: string) {
  return api.delete(`${base(kind)}/${id}`);
}

export async function deleteComment(id: string) {
  return api.delete(`/api/v1/comments/${id}`);
}

/** Tiny signal so a list reloads after you post (set by compose, read on focus). */
let dirty = false;
export const markFeedsDirty = () => {
  dirty = true;
};
export const takeFeedsDirty = () => {
  const d = dirty;
  dirty = false;
  return d;
};
