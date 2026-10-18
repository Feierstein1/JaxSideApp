import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, CONFIG_DEFAULTS, yardsLabel, type PlaceSummary } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { fetchRoom } from '@/discussion/api';
import { PostList } from '@/discussion/PostList';
import { getFreshReading } from '@/location/device';
import { OsmAttribution } from '@/places/Attribution';
import { PlaceStats, PlaceTop, placeFrame } from '@/places/PlaceHeader';
import { Button, FloatingButton, styles } from '@/ui';

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
  const [toast, setToast] = useState<string>();
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  function showToast(text: string) {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(undefined), 1600);
  }
  useEffect(() => () => clearTimeout(toastTimer.current), []);
  const loadRoom = useCallback((cursor?: string) => fetchRoom(id, cursor), [id]);
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
      showToast(place.isFavorite ? 'Removed from favorites' : 'Added to favorites');
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
      <View style={{ flex: 1, backgroundColor: COLORS.surfaceDark }}>
        {error ? (
          <View style={styles.screen}>
            <Text style={[styles.error, { color: COLORS.errorOnDark }]}>{error}</Text>
            <Button variant="link" title="Try again" onPress={() => void load()} />
          </View>
        ) : (
          <ActivityIndicator style={{ marginTop: 32 }} color={COLORS.accent} />
        )}
      </View>
    );
  }

  const info = (
    <View style={[placeFrame, { marginTop: 12, marginBottom: 8 }]}>
      <PlaceTop place={place} large favorite={{ onPress: () => void toggleFavorite(), busy }} />
      <PlaceStats place={place} />
      {place.address ? (
        <Text
          style={[
            styles.body,
            {
              paddingHorizontal: 12,
              paddingBottom: 10,
              backgroundColor: COLORS.background,
            },
          ]}
        >
          {place.address}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surfaceDark }}>
      <Stack.Screen options={{ title: place.name }} />
      {error ? (
        <Text style={[styles.error, { color: COLORS.errorOnDark, marginHorizontal: 16 }]}>
          {error}
        </Text>
      ) : null}
      {place.withinRoomRadius ? (
        <>
          <PostList
            load={loadRoom}
            onOpen={(p) => router.push(`/places/post/${p.id}`)}
            header={info}
            emptyTitle={`No posts for ${place.name} yet. Be the first!`}
            emptyAction={{ label: 'Start a new post', onPress: compose }}
          />
          {/* Same round + button as the area feed (D70). */}
          <FloatingButton label={`Write a post about ${place.name}`} onPress={compose} />
        </>
      ) : (
        <View>
          {info}
          <View style={[styles.banner, { marginHorizontal: 12 }]}>
            <Text style={styles.body}>
              Get within {yardsLabel(CONFIG_DEFAULTS['radius.business.maxMiles'])} of this place to
              see and join its discussion.
            </Text>
          </View>
          <OsmAttribution dark />
        </View>
      )}
      {toast ? <Toast text={toast} /> : null}
    </View>
  );
}

/** A short pop-up near the top (D70), e.g. "Added to favorites". */
function Toast({ text }: { text: string }) {
  return (
    <View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        top: 16,
        alignSelf: 'center',
        backgroundColor: COLORS.background,
        borderRadius: 999,
        paddingHorizontal: 16,
        paddingVertical: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        shadowColor: COLORS.shadow,
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
      }}
    >
      <Ionicons name="star" size={16} color={COLORS.accentDark} />
      <Text style={{ color: COLORS.text, fontWeight: '700' }}>{text}</Text>
    </View>
  );
}
