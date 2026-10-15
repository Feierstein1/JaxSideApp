import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Text, View } from 'react-native';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { BRAND, COLORS, CONFIG_DEFAULTS, type PlaceSummary } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { fetchRoom } from '@/discussion/api';
import { PostList } from '@/discussion/PostList';
import { categoryLabel, formatDistance, plural } from '@/format';
import { getFreshReading } from '@/location/device';
import { OsmAttribution } from '@/places/Attribution';
import { Button, styles } from '@/ui';

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
      setPlace({ ...place, isFavorite: !place.isFavorite });
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
    return error ? (
      <View style={styles.screen}>
        <Text style={styles.error}>{error}</Text>
        <Button variant="link" title="Try again" onPress={() => void load()} />
      </View>
    ) : (
      <ActivityIndicator style={{ marginTop: 32 }} color={COLORS.primary} />
    );
  }

  const info = (
    <View
      style={{
        backgroundColor: COLORS.background,
        margin: 12,
        marginBottom: 6,
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        borderTopWidth: 4,
        borderTopColor: BRAND.gold,
      }}
    >
      <Text style={styles.title}>{place.name}</Text>
      <Text style={styles.muted}>
        {categoryLabel(place.category)} · {formatDistance(place.distanceMeters)} away ·{' '}
        {plural(place.postCount, 'post')}
      </Text>
      {place.address ? <Text style={[styles.body, { marginTop: 6 }]}>{place.address}</Text> : null}
      <Button
        title={place.isFavorite ? '★ Saved to favorites' : '☆ Save to favorites'}
        onPress={() => void toggleFavorite()}
        busy={busy}
      />
      {place.withinRoomRadius ? (
        <Button variant="link" title="Write a post here" onPress={compose} />
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surfaceMuted }}>
      <Stack.Screen options={{ title: place.name }} />
      {place.withinRoomRadius ? (
        <PostList
          load={loadRoom}
          onOpen={(p) => router.push(`/places/post/${p.id}`)}
          header={info}
          emptyTitle={`No posts for ${place.name} yet. Be the first!`}
          emptyAction={{ label: 'Start a new post', onPress: compose }}
        />
      ) : (
        <View>
          {info}
          <View style={[styles.banner, { marginHorizontal: 12 }]}>
            <Text style={styles.body}>
              Get within {CONFIG_DEFAULTS['radius.business.maxMiles']} mi of this place to see and
              join its discussion.
            </Text>
          </View>
          <OsmAttribution />
        </View>
      )}
    </View>
  );
}
