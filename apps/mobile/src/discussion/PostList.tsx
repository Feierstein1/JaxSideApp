import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { DARK, type PostView } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/text';
import { Button, EmptyState, ErrorState, type IconName } from '@/ui';
import { takeFeedsDirty, type PostPage } from './api';
import { PostCard, PostSkeleton } from './PostCard';

/**
 * A paginated list of posts (P3.5, P3.11): one page (30, D112), then a "Load more posts"
 * button for the next; pull down to refresh. Shared by the area feed and place rooms.
 */
export function PostList({
  load,
  onOpen,
  header,
  emptyTitle,
  emptyBody,
  emptyIcon = 'chatbubbles-outline',
  emptyAction,
  reloadKey,
  fab,
  onScrollY,
}: {
  load: (cursor?: string) => Promise<PostPage>;
  onOpen: (post: PostView) => void;
  header?: ReactElement | null;
  emptyTitle: string;
  emptyBody?: string;
  emptyIcon?: IconName;
  emptyAction?: { label: string; onPress: () => void };
  /** Change to force a reload (e.g. sort changed). */
  reloadKey?: string;
  /**
   * D80: the floating + button. Shown only once there are posts; an empty feed offers its
   * own "Start a post" button instead, so there's one way to post, not two.
   */
  fab?: ReactElement;
  /** D201: the list's scroll position, for a sticky title. */
  onScrollY?: (y: number) => void;
}) {
  const [posts, setPosts] = useState<PostView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'refreshing' | 'more' | 'idle'>('loading');
  const [error, setError] = useState<string>();
  const req = useRef(0);

  const fetchPage = useCallback(
    async (mode: 'loading' | 'refreshing' | 'more', after?: string) => {
      const id = ++req.current;
      setState(mode);
      setError(undefined);
      try {
        const page = await load(after);
        if (id !== req.current) return;
        setPosts((prev) =>
          after
            ? [...prev, ...page.posts.filter((p) => !prev.some((q) => q.id === p.id))]
            : page.posts,
        );
        setCursor(page.nextCursor);
      } catch (e) {
        if (id !== req.current) return;
        // D77: a failed reload clears the old list, so posts from somewhere else never
        // look current. Loading more keeps what's already there.
        if (!after) {
          setPosts([]);
          setCursor(null);
        }
        setError(e instanceof ApiRequestError ? e.message : 'Couldn’t get your location.');
      } finally {
        if (id === req.current) setState('idle');
      }
    },
    [load],
  );

  useEffect(() => {
    void fetchPage('loading');
  }, [fetchPage, reloadKey]);

  // Coming back after posting: refresh so the new post shows at the top.
  useFocusEffect(
    useCallback(() => {
      if (takeFeedsDirty()) void fetchPage('refreshing');
    }, [fetchPage]),
  );

  return (
    <>
      <FlatList
        // D70: dark grey behind the white post cards, a step lighter than the black header.
        style={{ backgroundColor: DARK.page }}
        contentContainerStyle={{ paddingTop: 4, paddingBottom: 110, flexGrow: 1 }}
        data={posts}
        onScroll={onScrollY ? (e) => onScrollY(e.nativeEvent.contentOffset.y) : undefined}
        scrollEventThrottle={32}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <PostCard post={item} onOpen={() => onOpen(item)} onError={setError} />
        )}
        ListHeaderComponent={
          <>
            {header}
            {error ? (
              <ErrorState message={error} onRetry={() => void fetchPage('loading')} />
            ) : null}
          </>
        }
        ListEmptyComponent={
          state === 'idle' && !error ? (
            <EmptyState
              icon={emptyIcon}
              title={emptyTitle}
              body={emptyBody}
              action={
                emptyAction
                  ? { label: emptyAction.label, onPress: emptyAction.onPress, icon: 'add' }
                  : undefined
              }
            />
          ) : state === 'loading' ? (
            // D78: placeholders shaped like posts instead of a spinner.
            <View>
              <PostSkeleton />
              <PostSkeleton />
              <PostSkeleton />
            </View>
          ) : undefined
        }
        ListFooterComponent={
          state === 'more' ? (
            <ActivityIndicator style={{ margin: 16 }} color={DARK.accent} />
          ) : cursor && state === 'idle' ? (
            // D112: more only when asked for, so the list stays a sensible length.
            <Button
              variant="secondary"
              title="Load more posts"
              icon="chevron-down"
              onPress={() => void fetchPage('more', cursor)}
              style={{ marginHorizontal: 16, marginVertical: 12 }}
            />
          ) : posts.length > 2 && !cursor && state === 'idle' ? (
            // D78: the end of the list says so, instead of just stopping.
            <View
              style={{ alignItems: 'center', paddingVertical: 20, gap: 4 }}
              accessibilityRole="text"
            >
              <Ionicons name="checkmark-circle-outline" size={22} color={DARK.textMuted} />
              <Text style={{ color: DARK.textMuted, fontWeight: '600' }}>You’re all caught up</Text>
            </View>
          ) : undefined
        }

        refreshControl={
          <RefreshControl
            refreshing={state === 'refreshing'}
            onRefresh={() => void fetchPage('refreshing')}
            tintColor={DARK.accent}
            colors={[DARK.onAccent]}
            progressBackgroundColor={DARK.accent}
          />
        }
      />
      {posts.length > 0 ? fab : null}
    </>
  );
}
