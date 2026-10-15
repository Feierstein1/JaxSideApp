import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { COLORS, CONFIG_DEFAULTS, type PlaceSummary } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { categoryLabel, formatDistance } from '@/format';
import { getFreshReading } from '@/location/device';
import { OsmAttribution } from '@/places/Attribution';
import { Button, styles } from '@/ui';

/** P2.16 place detail; P3.2a's "get closer" message until discussion rooms exist (Phase 3). */
export default function PlaceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [place, setPlace] = useState<PlaceSummary>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const reading = await getFreshReading();
      const res = await api.post<{ place: PlaceSummary }>(`/api/v1/places/${id}`, { reading });
      setPlace(res.place);
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

  if (error && !place) {
    return (
      <View style={styles.screen}>
        <Text style={styles.error}>{error}</Text>
        <Button variant="link" title="Try again" onPress={() => void load()} />
      </View>
    );
  }
  if (!place) return <ActivityIndicator style={{ marginTop: 32 }} color={COLORS.primary} />;

  // Display only: the server enforces the radius when the room is opened (D19).
  const roomMiles = CONFIG_DEFAULTS['radius.business.maxMiles'];
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Stack.Screen options={{ title: place.name }} />
      <Text style={styles.title}>{place.name}</Text>
      <Text style={styles.muted}>
        {categoryLabel(place.category)} · {formatDistance(place.distanceMeters)} away
      </Text>
      {place.address ? <Text style={[styles.body, { marginTop: 8 }]}>{place.address}</Text> : null}

      <Button
        title={place.isFavorite ? '★ Saved to favorites' : '☆ Save to favorites'}
        onPress={() => void toggleFavorite()}
        busy={busy}
      />
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={[styles.banner, { marginTop: 16 }]}>
        <Text style={styles.body}>
          {place.withinRoomRadius
            ? 'You’re close enough to join this place’s discussion. Discussions open in a coming update.'
            : `Get within ${roomMiles} mi of this place to view its discussion.`}
        </Text>
      </View>
      <OsmAttribution />
    </ScrollView>
  );
}
