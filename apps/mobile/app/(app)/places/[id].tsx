import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  DARK,
  CONFIG_DEFAULTS,
  yardsLabel,
  type PlaceSummary,
  type PostTypeFilter,
} from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { fetchRoom } from '@/discussion/api';
import { PostList } from '@/discussion/PostList';
import { PostTypeTabs } from '@/discussion/PostTypeTabs';
import { formatDistance } from '@/format';
import { getFreshReading } from '@/location/device';
import { haptic } from '@/motion';
import { OsmAttribution } from '@/places/Attribution';
import { refreshLimiter } from '@/refresh-limit';
import { PlaceHero, PlaceSkeleton, StickyPlaceName } from '@/places/PlaceHeader';
import { PlaceRatingCard } from '@/places/PlaceRating';
import { social } from '@/social/api';
import { Text } from '@/text';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { ErrorState, FloatingButton, RefreshButton, SectionTitle, useToast } from '@/ui';
import { showAlert } from '@/dialog';
import { ensureGuide } from '@/guides/guide';

/**
 * A place: info card, favorite toggle, and its discussion room (P3.2). The room opens
 * only within 0.3 mi (D19); otherwise the "get closer" message (P3.2a). The server
 * enforces this; the app only mirrors it.
 */
export default function PlaceScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAuth();
  const [place, setPlace] = useState<PlaceSummary>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  // D201: show the small sticky name once the big one has scrolled away.
  const [stuck, setStuck] = useState(false);
  const stuckRef = useRef(false);
  const heroBottom = useRef(150);
  const onScrollY = useCallback((y: number) => {
    const next = y > heroBottom.current;
    if (next !== stuckRef.current) {
      stuckRef.current = next;
      setStuck(next);
    }
  }, []);
  const toast = useToast(); // D70 / D78: "Added to favorites"
  const [type, setType] = useState<PostTypeFilter>('all'); // D75
  // D128: refresh the discussion (a new location fix, then reload), 30 a minute like Home.
  const [reloads, setReloads] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  async function refreshRoom() {
    const wait = refreshLimiter.tap();
    if (wait) {
      showAlert('Slow down a little', `You can refresh again in ${wait} s.`, undefined, {
        icon: 'hourglass-outline',
        tone: 'warning',
      });
      return;
    }
    setRefreshing(true);
    try {
      await getFreshReading({ fresh: true });
    } catch {
      // the list shows the location error
    } finally {
      setRefreshing(false);
      setReloads((n) => n + 1);
    }
  }
  // D76: which of your friends favorited this place (others see only the count).
  const [friendFans, setFriendFans] = useState<string[]>([]);
  useEffect(() => {
    social
      .friendsFavorited(id)
      .then((r) => setFriendFans(r.friends.map((f) => f.username)))
      .catch(() => setFriendFans([]));
  }, [id, place?.isFavorite]);
  const loadRoom = useCallback((cursor?: string) => fetchRoom(id, cursor, type), [id, type]);
  const verified = state.status === 'signedIn' && state.user.emailVerified;

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const reading = await getFreshReading();
      setPlace(
        (await api.post<{ place: PlaceSummary }>(`/api/v1/places/${id}`, { reading })).place,
      );
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t get your location.');
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleFavorite() {
    if (!place) return;
    setBusy(true);
    try {
      const path = `/api/v1/places/${place.id}/favorite`;
      if (place.isFavorite) await api.delete(path);
      else await api.put(path, {});
      setPlace({
        ...place,
        isFavorite: !place.isFavorite,
        favoriteCount: Math.max(0, place.favoriteCount + (place.isFavorite ? -1 : 1)),
      });
      if (!place.isFavorite) haptic.success();
      toast.show(
        place.isFavorite ? 'Removed from favorites' : 'Added to favorites',
        place.isFavorite ? 'star-outline' : 'star',
      );
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  }

  function compose() {
    if (!place) return;
    if (!verified) {
      showAlert(
        'Confirm your email first',
        'Enter the 6-digit code from your email in Account.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Go to Account', onPress: () => router.push('/account') },
        ],
        { icon: 'mail-unread-outline', tone: 'info' },
      );
      return;
    }
    router.push({
      pathname: '/places/compose',
      params: { placeId: place.id, placeName: place.name },
    });
  }

  if (!place) {
    return (
      <View style={{ flex: 1, backgroundColor: DARK.page, paddingTop: SPACE.sm }}>
        {error ? <ErrorState message={error} onRetry={() => void load()} /> : <PlaceSkeleton />}
      </View>
    );
  }

  /** D94: start (or join) a "closed / doesn't exist" vote. Needs you near the place. */
  async function askRemoval() {
    if (!place) return;
    if (!(await ensureGuide('placeRemoval'))) return; // D104
    showAlert(
      `Is ${place.name} closed?`,
      'Only if it has closed for good, moved, or was never here. People nearby will vote; 10 votes take it off Places. Your vote counts first and can’t be changed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, it’s closed',
          style: 'destructive',
          onPress: () =>
            void (async () => {
              try {
                const reading = await getFreshReading({ fresh: true });
                const r = await api.post<{ outcome: string }>(
                  `/api/v1/places/${place.id}/removal`,
                  { reading },
                );
                showAlert(
                  'Thanks',
                  r.outcome === 'removed'
                    ? 'That was the deciding vote: it’s off Places.'
                    : 'People nearby can now vote on it under “Verify changes near you” in Places.',
                );
              } catch (e) {
                showAlert('Couldn’t send', e instanceof ApiRequestError ? e.message : 'Try again.');
              }
            })(),
        },
      ],
      { icon: 'close-circle-outline' },
    );
  }

  const hero = (
    <>
      {/* The name is the hero's first block; the sticky one appears once that has scrolled off. */}
      <View
        onLayout={(e) => (heroBottom.current = Math.max(80, e.nativeEvent.layout.height * 0.3))}
      >
        <PlaceHero
          place={place}
          onFavorite={() => void toggleFavorite()}
          favoriteBusy={busy}
          friendFans={friendFans}
        />
      </View>
      {/* D144: like or dislike, only while you're here. */}
      <PlaceRatingCard place={place} onChange={(r) => setPlace({ ...place, ...r })} />
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          columnGap: SPACE.lg,
          marginHorizontal: SPACE.md,
          marginTop: SPACE.sm,
        }}
      >
        {/* B6.5 / D224: how owners run their place (on the business website, not here). */}
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/places/owner', params: { placeId: place.id } })}
          hitSlop={8}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 }}
        >
          <Ionicons name="ribbon-outline" size={16} color={DARK.textMuted} />
          <Text style={[TYPE.caption, { color: DARK.textMuted }]}>I own this place</Text>
        </Pressable>
        {place.withinRoomRadius ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => void askRemoval()}

            hitSlop={8}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36 }}
          >
            <Ionicons name="close-circle-outline" size={16} color={DARK.textMuted} />
            <Text style={[TYPE.caption, { color: DARK.textMuted }]}>Closed or doesn’t exist?</Text>
          </Pressable>
        ) : null}
      </View>
    </>
  );

  return (
    <View style={{ flex: 1, backgroundColor: DARK.page }}>
      <Stack.Screen options={{ title: place.name }} />
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {place.withinRoomRadius ? (
        <>
          <PostList
            load={loadRoom}
            reloadKey={`${type}:${reloads}`}
            onScrollY={onScrollY}
            adContext={{ kind: 'place', id }} // D206
            onOpen={(p) => router.push(`/places/post/${p.id}`)}
            header={
              <>
                {hero}
                <SectionTitle
                  action={
                    <RefreshButton size={32} onPress={() => void refreshRoom()} busy={refreshing} />
                  }
                >
                  Discussion
                </SectionTitle>
                {/* D75: the same post-type tabs as Home. */}
                <View
                  style={{
                    marginHorizontal: SPACE.md,
                    marginBottom: 6,
                    paddingHorizontal: 4,
                    borderRadius: RADIUS.md,
                    backgroundColor: DARK.card,
                  }}
                >
                  <PostTypeTabs value={type} onChange={setType} />
                </View>
              </>
            }
            emptyIcon="chatbubbles-outline"
            emptyTitle="No posts here yet"
            emptyBody={`Been to ${place.name}? Start the conversation for people nearby.`}
            emptyAction={{ label: 'Start a post', onPress: compose }}
            fab={
              <FloatingButton
                title="Add Post"
                label={`Write a post about ${place.name}`}
                onPress={compose}
              />
            }
          />
        </>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: 48 }}
          onScroll={(e) => onScrollY(e.nativeEvent.contentOffset.y)}
          scrollEventThrottle={32}
        >
          {hero}
          {/* D78: a clear "locked" state that says how far you are. */}
          <View
            style={{
              margin: SPACE.md,
              padding: SPACE.xl - 4,
              borderRadius: RADIUS.lg,
              backgroundColor: DARK.card,
              borderWidth: 1,
              borderColor: DARK.hairline,
              borderStyle: 'dashed',
              alignItems: 'center',
              gap: SPACE.sm,
            }}
          >
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: DARK.accentSoft,
              }}
            >
              <Ionicons name="lock-closed" size={26} color={DARK.accent} />
            </View>
            <Text accessibilityRole="header" style={[TYPE.headline, { textAlign: 'center' }]}>
              Get closer to join the conversation
            </Text>
            <Text style={[TYPE.callout, { color: DARK.textMuted, textAlign: 'center' }]}>
              The discussion opens within {yardsLabel(CONFIG_DEFAULTS['radius.business.maxMiles'])}{' '}
              of {place.name}. You’re about {formatDistance(place.distanceMeters)} away.
            </Text>
          </View>
          <OsmAttribution dark />
        </ScrollView>
      )}
      <StickyPlaceName place={place} show={stuck} />
      {toast.node}
    </View>
  );
}
