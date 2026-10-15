import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { COLORS, type PostView } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { Button, styles } from '@/ui';
import { takeFeedsDirty, type PostPage } from './api';
import { PostCard } from './PostCard';

/**
 * A paginated list of posts (P3.5, P3.11): loads one page, then the next as you scroll
 * near the bottom; pull down to refresh. Shared by the area feed and place rooms.
 */
export function PostList({
  load,
  onOpen,
  header,
  emptyTitle,
  emptyAction,
  reloadKey,
}: {
  load: (cursor?: string) => Promise<PostPage>;
  onOpen: (post: PostView) => void;
  header?: ReactElement | null;
  emptyTitle: string;
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
      style={{ backgroundColor: COLORS.surfaceMuted }}
      contentContainerStyle={{ paddingVertical: 6, flexGrow: 1 }}
      data={posts}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => (
        <PostCard post={item} onOpen={() => onOpen(item)} onError={setError} />
      )}
      ListHeaderComponent={
        <>
          {header}
          {error ? (
            <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
              <Text style={styles.error}>{error}</Text>
              <Button variant="link" title="Try again" onPress={() => void fetchPage('loading')} />
            </View>
          ) : null}
        </>
      }
      ListEmptyComponent={
        state === 'idle' && !error ? (
          <View style={{ alignItems: 'center', padding: 32, gap: 8 }}>
            <Text style={[styles.title, { fontSize: 20, textAlign: 'center' }]}>{emptyTitle}</Text>
            {emptyAction ? (
              <Button title={emptyAction.label} onPress={emptyAction.onPress} />
            ) : null}
          </View>
        ) : state === 'loading' ? (
          <ActivityIndicator style={{ marginTop: 32 }} color={COLORS.primary} />
        ) : null
      }
      ListFooterComponent={
        state === 'more' ? (
          <ActivityIndicator style={{ margin: 16 }} color={COLORS.primary} />
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
          tintColor={COLORS.primary}
          colors={[COLORS.primary]}
        />
      }
    />
  );
}
