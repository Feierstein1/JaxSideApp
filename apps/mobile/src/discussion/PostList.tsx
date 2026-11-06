import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import {
  adSlotPositions,
  DARK,
  type AdCard as Ad,
  type AdContext,
  type PostView,
} from '@jax/shared';
import { AdCard } from '@/ads/AdCard';
import { adLayout, adSeen, fetchAds } from '@/ads/api';
import { ApiRequestError } from '@/api/client';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Text } from '@/text';
import { Button, EmptyState, ErrorState, type IconName } from '@/ui';
import { takeFeedsDirty, type PostPage } from './api';
import { stopMediaNotIn } from './media-focus';
import { PostCard, PostSkeleton } from './PostCard';

type Row = { kind: 'post'; post: PostView } | { kind: 'ad'; ad: Ad; after: number };

/** D206: an ad counts as seen when half of it has been on screen for a second. */
const AD_VIEWABILITY = { itemVisiblePercentThreshold: 50, minimumViewTime: 1000 };
/** Ask for enough ads for the densest spacing (guests); extra ones are simply not shown. */
const DENSEST = 6;

const today = () => new Date().toISOString().slice(0, 10);

/**
 * A paginated list of posts (P3.5, P3.11): one page (30, D112), then a "Load more posts"
 * button for the next; pull down to refresh. Shared by the area feed, place rooms and topics.
 * D206: with `adContext`, ads sit between posts at `adSlotPositions` (the server picks them).
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
  adContext,
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
  /** D206: which screen this is, for its ads (none when left out). */
  adContext?: AdContext;
}) {
  const [posts, setPosts] = useState<PostView[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'refreshing' | 'more' | 'idle'>('loading');
  const [error, setError] = useState<string>();
  const req = useRef(0);
  /** D206: post count → the ad that follows that post. */
  const [ads, setAds] = useState<Record<number, Ad>>({});
  const adContextKey = adContext ? JSON.stringify(adContext) : null;

  /** Fills the ad slots between posts `from` and `to` (a new page, or the first one). */
  const placeAds = useCallback(
    async (from: number, to: number, forRequest: number) => {
      if (!adContextKey) return;
      const seed = `${adContextKey}:${today()}`;
      const want = adSlotPositions({ from, to, first: adLayout().first, every: DENSEST, seed });
      if (!want.length) return;
      try {
        const got = await fetchAds(
          JSON.parse(adContextKey) as AdContext,
          Math.min(want.length, 10),
        );
        if (forRequest !== req.current || !got.length) return;
        // The server's spacing for this person (it may have changed since the last answer).
        const { first, every } = adLayout();
        const slots = adSlotPositions({ from, to, first, every, seed });
        setAds((prev) => {
          const next = { ...prev };
          slots.forEach((after, i) => {
            if (got[i]) next[after] = got[i];
          });
          return next;
        });
      } catch {
        // No ads this time; the posts are what matter.
      }
    },
    [adContextKey],
  );

  const fetchPage = useCallback(
    async (mode: 'loading' | 'refreshing' | 'more', after?: string) => {
      const id = ++req.current;
      setState(mode);
      setError(undefined);
      try {
        const page = await load(after);
        if (id !== req.current) return;
        let from = 0;
        let to = page.posts.length;
        setPosts((prev) => {
          if (!after) return page.posts;
          const added = page.posts.filter((p) => !prev.some((q) => q.id === p.id));
          from = prev.length;
          to = prev.length + added.length;
          return [...prev, ...added];
        });
        if (!after) setAds({});
        setCursor(page.nextCursor);
        void placeAds(from, to, id);
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
    [load, placeAds],
  );

  const rows = useMemo<Row[]>(() => {
    const out: Row[] = [];
    posts.forEach((post, i) => {
      out.push({ kind: 'post', post });
      const ad = ads[i + 1];
      if (ad) out.push({ kind: 'ad', ad, after: i + 1 });
    });
    return out;
  }, [posts, ads]);

  // FlatList needs the same callback for its whole life.
  const viewabilityPairs = useRef([
    {
      viewabilityConfig: AD_VIEWABILITY,
      onViewableItemsChanged: ({ viewableItems }: { viewableItems: { item: Row }[] }) => {
        for (const v of viewableItems) if (v.item.kind === 'ad') adSeen(v.item.ad.id);
      },
    },
    {
      // D203: a clip or video stops and resets as soon as its post has scrolled out of view.
      viewabilityConfig: { itemVisiblePercentThreshold: 1 },
      onViewableItemsChanged: ({ viewableItems }: { viewableItems: { item: Row }[] }) =>
        stopMediaNotIn(
          new Set(viewableItems.flatMap((v) => (v.item.kind === 'post' ? [v.item.post.id] : []))),
        ),
    },
  ]).current;

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
        data={rows}
        viewabilityConfigCallbackPairs={viewabilityPairs}
        onScroll={onScrollY ? (e) => onScrollY(e.nativeEvent.contentOffset.y) : undefined}
        scrollEventThrottle={32}
        keyExtractor={(r) => (r.kind === 'post' ? r.post.id : `ad:${r.after}:${r.ad.id}`)}
        renderItem={({ item }) =>
          item.kind === 'ad' ? (
            <AdCard ad={item.ad} />
          ) : (
            <PostCard post={item.post} onOpen={() => onOpen(item.post)} onError={setError} />
          )
        }
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
