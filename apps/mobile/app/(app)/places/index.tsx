import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import MapView, { Marker } from 'react-native-maps';
import { router } from 'expo-router';
import {
  BRAND,
  CATEGORY_GROUPS,
  COLORS,
  type LocationReading,
  type PlaceSort,
  type PlaceSummary,
} from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { categoryLabel, formatDistance, plural } from '@/format';
import { getFreshReading } from '@/location/device';
import { OsmAttribution } from '@/places/Attribution';
import { Button, Chip, Segmented, styles } from '@/ui';

interface SearchResponse {
  places: PlaceSummary[];
  nextOffset: number | null;
}

type View_ = 'list' | 'map';
const SORTS: { key: PlaceSort; label: string }[] = [
  { key: 'distance', label: 'Nearest' },
  { key: 'name', label: 'A–Z' },
  { key: 'favorites', label: 'Favorites first' },
];
const MAP_PINS = 50;

/**
 * P2.16 / D40: nearby places as a list or a map, with search, category filters and sort.
 * Every request carries a recent reading; the server decides eligibility and ordering.
 */
export default function PlacesScreen() {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const [sort, setSort] = useState<PlaceSort | null>(null);
  const [view, setView] = useState<View_>('list');
  const [places, setPlaces] = useState<PlaceSummary[]>([]);
  const [here, setHere] = useState<LocationReading>();
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const requestId = useRef(0);

  const load = useCallback(
    async (offset = 0) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(undefined);
      try {
        const reading = await getFreshReading();
        const categories = CATEGORY_GROUPS.find((g) => g.key === group)?.categories;
        const res = await api.post<SearchResponse>('/api/v1/places/search', {
          reading,
          ...(q.trim() ? { q: q.trim() } : {}),
          ...(categories ? { categories } : {}),
          ...(sort ? { sort } : {}),
          ...(view === 'map' ? { limit: MAP_PINS } : {}),
          offset,
        });
        if (id !== requestId.current) return; // a newer request started
        setHere(reading);
        setPlaces((prev) => (offset === 0 ? res.places : [...prev, ...res.places]));
        setNextOffset(res.nextOffset);
      } catch (e) {
        if (id !== requestId.current) return;
        setError(e instanceof ApiRequestError ? e.message : 'Couldn’t get your location.');
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [q, group, sort, view],
  );

  // Reload when anything changes; wait a moment while the user is typing.
  useEffect(() => {
    const t = setTimeout(() => void load(0), q ? 400 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const openPlace = (p: PlaceSummary) => router.push(`/places/${p.id}`);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.background }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 8 }}>
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
        <View style={[styles.row, { justifyContent: 'space-between', marginVertical: 0 }]}>
          <Segmented
            options={[
              { key: 'list', label: 'List' },
              { key: 'map', label: 'Map' },
            ]}
            value={view}
            onChange={(v) => setView(v as View_)}
          />
          <Segmented
            options={SORTS}
            value={sort ?? (q ? '' : 'distance')}
            onChange={(v) => setSort(v as PlaceSort)}
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }}>
          <Chip label="All" active={group === null} onPress={() => setGroup(null)} />
          {CATEGORY_GROUPS.map((g) => (
            <Chip
              key={g.key}
              label={g.label}
              active={group === g.key}
              onPress={() => setGroup(group === g.key ? null : g.key)}
            />
          ))}
        </ScrollView>
      </View>

      {error ? (
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={styles.error}>{error}</Text>
          <Button variant="link" title="Try again" onPress={() => void load(0)} />
        </View>
      ) : null}

      {view === 'map' ? (
        <View style={{ flex: 1, marginTop: 8 }}>
          {here ? (
            <MapView
              style={{ flex: 1 }}
              initialRegion={{
                latitude: here.latitude,
                longitude: here.longitude,
                latitudeDelta: 0.03,
                longitudeDelta: 0.03,
              }}
              showsUserLocation
              accessibilityLabel="Map of nearby places"
            >
              {places.map((p) => (
                <Marker
                  key={p.id}
                  coordinate={{ latitude: p.latitude, longitude: p.longitude }}
                  title={p.name}
                  description={`${categoryLabel(p.category)} · ${formatDistance(p.distanceMeters)} · ${plural(p.postCount, 'post')}`}
                  pinColor={p.isFavorite ? BRAND.gold : BRAND.teal}
                  onCalloutPress={() => openPlace(p)}
                />
              ))}
            </MapView>
          ) : (
            <ActivityIndicator style={{ margin: 16 }} color={COLORS.primary} />
          )}
          {loading && here ? (
            <ActivityIndicator
              style={{ position: 'absolute', top: 12, alignSelf: 'center' }}
              color={COLORS.primary}
            />
          ) : null}
          <OsmAttribution />
        </View>
      ) : (
        <FlatList
          data={places}
          keyExtractor={(p) => p.id}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, ${categoryLabel(item.category)}, ${formatDistance(item.distanceMeters)} away`}
              onPress={() => openPlace(item)}
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
              <Text
                style={{
                  color: item.postCount > 0 ? COLORS.primary : COLORS.textMuted,
                  fontSize: 13,
                  marginTop: 2,
                }}
              >
                {item.postCount > 0 ? plural(item.postCount, 'post') : 'No posts yet'}
              </Text>
            </Pressable>
          )}
          onEndReached={() => {
            if (!loading && nextOffset !== null) void load(nextOffset);
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
      )}
    </View>
  );
}
