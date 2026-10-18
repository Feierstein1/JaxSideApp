import { useCallback, useEffect, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  BRAND,
  COLORS,
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
import { PlaceSkeleton, PlaceStats, PlaceTop, placeFrame } from '@/places/PlaceHeader';
import { elevation, SPACE, TYPE } from '@/tokens';
import { ErrorState, FloatingButton, SectionTitle, useToast } from '@/ui';

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
  const toast = useToast(); // D70 / D78: "Added to favorites"
  const [type, setType] = useState<PostTypeFilter>('all'); // D75
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
      Alert.alert(
        'Confirm your email first',
        'Enter the 6-digit code from your email in Account.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Go to Account', onPress: () => router.push('/account') },
        ],
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
      <View style={{ flex: 1, backgroundColor: COLORS.surfaceDark, paddingTop: SPACE.sm }}>
        {error ? (
          <ErrorState dark message={error} onRetry={() => void load()} />
        ) : (
          <PlaceSkeleton />
        )}
      </View>
    );
  }

  const info = (
    <View style={[placeFrame, elevation(1), { marginTop: SPACE.md, marginBottom: SPACE.xs }]}>
      <PlaceTop place={place} large favorite={{ onPress: () => void toggleFavorite(), busy }} />
      <PlaceStats place={place} />
      {place.address ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 8,
            paddingHorizontal: 14,
            paddingBottom: 12,
            backgroundColor: COLORS.background,
          }}
        >
          <Ionicons name="location-outline" size={17} color={COLORS.textMuted} />
          <Text style={[TYPE.callout, { flex: 1, color: COLORS.text }]}>{place.address}</Text>
        </View>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surfaceDark }}>
      <Stack.Screen options={{ title: place.name }} />
      {error ? <ErrorState dark message={error} onRetry={() => void load()} /> : null}
      {place.withinRoomRadius ? (
        <>
          {/* D75: the same post-type bar as Home, fixed above the room's posts. */}
          <View style={{ backgroundColor: COLORS.surfaceInverse, paddingHorizontal: 12 }}>
            <PostTypeTabs value={type} onChange={setType} />
          </View>
          <PostList
            load={loadRoom}
            reloadKey={type}
            onOpen={(p) => router.push(`/places/post/${p.id}`)}
            header={
              <>
                {info}
                <SectionTitle dark>Discussion</SectionTitle>
              </>
            }
            emptyIcon="chatbubbles-outline"
            emptyTitle="No posts here yet"
            emptyBody={`Been to ${place.name}? Start the conversation for people nearby.`}
            emptyAction={{ label: 'Start a post', onPress: compose }}
          />
          {/* Same round + button as the area feed (D70). */}
          <FloatingButton label={`Write a post about ${place.name}`} onPress={compose} />
        </>
      ) : (
        <View>
          {info}
          {/* D78: a clear "locked" state that says how far you are. */}
          <View
            style={{
              margin: SPACE.md,
              padding: SPACE.xl - 4,
              borderRadius: 16,
              backgroundColor: COLORS.surfaceDarkRaised,
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
                backgroundColor: COLORS.surfaceInverse,
              }}
            >
              <Ionicons name="lock-closed" size={26} color={BRAND.gold} />
            </View>
            <Text
              accessibilityRole="header"
              style={[TYPE.headline, { color: COLORS.onSurfaceDark, textAlign: 'center' }]}
            >
              Get closer to join the conversation
            </Text>
            <Text style={[TYPE.callout, { color: COLORS.onSurfaceDarkMuted, textAlign: 'center' }]}>
              The discussion opens within {yardsLabel(CONFIG_DEFAULTS['radius.business.maxMiles'])}{' '}
              of {place.name}. You’re about {formatDistance(place.distanceMeters)} away.
            </Text>
          </View>
          <OsmAttribution dark />
        </View>
      )}
      {toast.node}
    </View>
  );
}
