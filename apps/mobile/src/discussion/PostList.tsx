import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { COLORS, type PostView } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import Ionicons from '@expo/vector-icons/Ionicons';
import { EmptyState, ErrorState, type IconName } from '@/ui';
import { takeFeedsDirty, type PostPage } from './api';
import { PostCard, PostSkeleton } from './PostCard';

/**
 * A paginated list of posts (P3.5, P3.11): loads one page, then the next as you scroll
 * near the bottom; pull down to refresh. Shared by the area feed and place rooms.
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
    <FlatList
      // D70: dark grey behind the white post cards, a step lighter than the black header.
      style={{ backgroundColor: COLORS.surfaceDark }}
      contentContainerStyle={{ paddingTop: 6, paddingBottom: 104, flexGrow: 1 }}
      data={posts}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => (
        <PostCard post={item} onOpen={() => onOpen(item)} onError={setError} />
      )}
      ListHeaderComponent={
        <>
          {header}
          {error ? (
            <ErrorState dark message={error} onRetry={() => void fetchPage('loading')} />
          ) : null}
        </>
      }
      ListEmptyComponent={
        state === 'idle' && !error ? (
          <EmptyState
            dark
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
        ) : null
      }
      ListFooterComponent={
        state === 'more' ? (
          <ActivityIndicator style={{ margin: 16 }} color={COLORS.accent} />
        ) : posts.length > 2 && !cursor && state === 'idle' ? (
          // D78: the end of the list says so, instead of just stopping.
          <View
            style={{ alignItems: 'center', paddingVertical: 20, gap: 4 }}
            accessibilityRole="text"
          >
            <Ionicons name="checkmark-circle-outline" size={22} color={COLORS.onSurfaceDarkMuted} />
            <Text style={{ color: COLORS.onSurfaceDarkMuted, fontWeight: '600' }}>
              You’re all caught up
            </Text>
          </View>
        ) : null
      }
      onEndReachedThreshold={0.5}
      onEndReached={() => {
        if (state === 'idle' && cursor) void fetchPage('more', cursor);
      }}
      refreshControl={
        <RefreshControl
          refreshing={state === 'refreshing'}
          onRefresh={() => void fetchPage('refreshing')}
          tintColor={COLORS.accent}
          colors={[COLORS.primary]}
        />
      }
    />
  );
}
