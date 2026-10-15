import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { COLORS, type PlaceSummary } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { categoryLabel, formatDistance } from '@/format';
import { getFreshReading } from '@/location/device';
import { OsmAttribution } from '@/places/Attribution';
import { Button, styles } from '@/ui';

interface SearchResponse {
  places: PlaceSummary[];
  nextOffset: number | null;
}

/** P2.16: nearby places, or name search. The server decides location eligibility. */
export default function PlacesScreen() {
  const [q, setQ] = useState('');
  const [places, setPlaces] = useState<PlaceSummary[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const requestId = useRef(0);

  const load = useCallback(async (query: string, offset = 0) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(undefined);
    try {
      const reading = await getFreshReading();
      const res = await api.post<SearchResponse>('/api/v1/places/search', {
        reading,
        ...(query.trim() ? { q: query.trim() } : {}),
        offset,
      });
      if (id !== requestId.current) return; // a newer search started
      setPlaces((prev) => (offset === 0 ? res.places : [...prev, ...res.places]));
      setNextOffset(res.nextOffset);
    } catch (e) {
      if (id !== requestId.current) return;
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t get your location.');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, []);

  // Search as you type, after a short pause.
  useEffect(() => {
    const t = setTimeout(() => void load(q), q ? 400 : 0);
    return () => clearTimeout(t);
  }, [q, load]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <View style={{ padding: 16, paddingBottom: 8 }}>
        <TextInput
          accessibilityLabel="Search places"
          placeholder="Search restaurants, parks, shops…"
          placeholderTextColor={COLORS.placeholder}
          value={q}
          onChangeText={setQ}
          autoCorrect={false}
          returnKeyType="search"
          style={styles.input}
        />
      </View>
      {error ? (
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={styles.error}>{error}</Text>
          <Button variant="link" title="Try again" onPress={() => void load(q)} />
        </View>
      ) : null}
      <FlatList
        data={places}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${categoryLabel(item.category)}, ${formatDistance(item.distanceMeters)} away`}
            onPress={() => router.push(`/places/${item.id}`)}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              borderBottomWidth: 1,
              borderBottomColor: COLORS.border,
            }}
          >
            <Text style={[styles.body, { fontWeight: '600' }]}>
              {item.isFavorite ? '★ ' : ''}
              {item.name}
            </Text>
            <Text style={styles.muted}>
              {categoryLabel(item.category)} · {formatDistance(item.distanceMeters)}
              {item.withinRoomRadius ? ' · You’re here' : ''}
            </Text>
          </Pressable>
        )}
        onEndReached={() => {
          if (!loading && nextOffset !== null) void load(q, nextOffset);
        }}
        ListEmptyComponent={
          !loading && !error ? (
            <Text style={[styles.muted, { padding: 16 }]}>No places found.</Text>
          ) : null
        }
        ListFooterComponent={
          <>
            {loading ? <ActivityIndicator style={{ margin: 16 }} color={COLORS.primary} /> : null}
            <OsmAttribution />
          </>
        }
      />
    </View>
  );
}
