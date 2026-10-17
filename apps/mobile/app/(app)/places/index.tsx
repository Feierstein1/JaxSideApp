import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BRAND, CATEGORY_GROUPS, COLORS, type PlaceSort, type PlaceSummary } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { categoryLabel, formatDistance, plural } from '@/format';
import { getFreshReading } from '@/location/device';
import { AreaLabel } from '@/location/AreaLabel';
import { OsmAttribution } from '@/places/Attribution';
import { PlaceStats, PlaceTop, placeFrame } from '@/places/PlaceHeader';
import { Button, Chip, FloatingButton, styles } from '@/ui';

interface SearchResponse {
  places: PlaceSummary[];
  nextOffset: number | null;
  /** D72: closest named neighborhood. */
  area?: string | null;
}

const SORTS: { key: PlaceSort; label: string }[] = [
  { key: 'distance', label: 'Nearest' },
  { key: 'name', label: 'A–Z' },
  { key: 'favorites', label: 'Favorites first' },
];

/**
 * P2.16 / D40 / D69 / D70 / D71: places within your radius (≤ 0.3 mi), as cards on a dark background. The black
 * bar under the header has the filter button and the search box; "Add new place" is the
 * round button bottom-right, like the new-post button. The server decides eligibility,
 * distance and ordering from a fresh reading.
 */
export default function PlacesScreen() {
  const [q, setQ] = useState('');
  const [group, setGroup] = useState<string | null>(null);
  const [sort, setSort] = useState<PlaceSort | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [places, setPlaces] = useState<PlaceSummary[]>([]);
  const [nextOffset, setNextOffset] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [area, setArea] = useState<string | null>(null);
  const requestId = useRef(0);
  const filtered = group !== null || (sort !== null && sort !== 'distance');

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
          offset,
        });
        if (id !== requestId.current) return; // a newer request started
        setPlaces((prev) => (offset === 0 ? res.places : [...prev, ...res.places]));
        setNextOffset(res.nextOffset);
        if (offset === 0) setArea(res.area ?? null);
      } catch (e) {
        if (id !== requestId.current) return;
        setError(e instanceof ApiRequestError ? e.message : 'Couldn’t get your location.');
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [q, group, sort],
  );

  // Reload when anything changes; wait a moment while the user is typing.
  useEffect(() => {
    const t = setTimeout(() => void load(0), q ? 400 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surfaceDark }}>
      {/* Black bar under the black header: where you are (D72), then filter + search. */}
      <View
        style={{
          backgroundColor: COLORS.surfaceInverse,
          paddingHorizontal: 12,
          paddingTop: 4,
          paddingBottom: 12,
          gap: 8,
        }}
      >
        <AreaLabel name={area} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={filtered ? 'Filters (on)' : 'Filters'}
            onPress={() => setFiltersOpen(true)}
            hitSlop={8}
            style={{
              width: 44,
              height: 44,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: filtered ? BRAND.gold : COLORS.onSurfaceInverse,
            }}
          >
            <Ionicons
              name={filtered ? 'options' : 'options-outline'}
              size={22}
              color={filtered ? BRAND.gold : COLORS.onSurfaceInverse}
            />
          </Pressable>
          <TextInput
            accessibilityLabel="Search places"
            placeholder="Search places nearby…"
            placeholderTextColor={COLORS.placeholder}
            value={q}
            onChangeText={setQ}
            autoCorrect={false}
            returnKeyType="search"
            style={[
              styles.input,
              { flex: 1, backgroundColor: COLORS.background, borderColor: COLORS.background },
            ]}
          />
        </View>
      </View>

      {error ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <Text style={[styles.error, { color: COLORS.errorOnDark }]}>{error}</Text>
          <Button variant="link" title="Try again" onPress={() => void load(0)} />
        </View>
      ) : null}

      <FlatList
        data={places}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingTop: 10, paddingBottom: 96 }}
        renderItem={({ item }) => <PlaceCard place={item} />}
        onEndReached={() => {
          if (!loading && nextOffset !== null) void load(nextOffset);
        }}
        ListEmptyComponent={
          !loading && !error ? (
            <Text style={{ padding: 16, color: COLORS.onSurfaceDarkMuted }}>
              No places within your radius. You can change it in Account → Settings.
            </Text>
          ) : null
        }
        ListFooterComponent={
          <>
            {loading ? <ActivityIndicator style={{ margin: 16 }} color={COLORS.accent} /> : null}
            <OsmAttribution dark />
          </>
        }
      />

      {/* P5.8: suggest a missing place; same round button and spot as "new post". */}
      <FloatingButton label="Add new place" onPress={() => router.push('/places/suggest')} />

      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        group={group}
        setGroup={setGroup}
        sort={sort ?? (q ? null : 'distance')}
        setSort={setSort}
      />
    </View>
  );
}

/** One place (D69, D70): category-colored header + distance and posts, in a 2 px black frame. */
function PlaceCard({ place }: { place: PlaceSummary }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${place.name}, ${categoryLabel(place.category)}, ${formatDistance(place.distanceMeters)} away, ${plural(place.postCount, 'post')}`}
      onPress={() => router.push(`/places/${place.id}`)}
      style={({ pressed }) => [placeFrame, { opacity: pressed ? 0.9 : 1 }]}
    >
      <PlaceTop place={place} />
      <PlaceStats place={place} />
    </Pressable>
  );
}

function FilterSheet({
  open,
  onClose,
  group,
  setGroup,
  sort,
  setSort,
}: {
  open: boolean;
  onClose: () => void;
  group: string | null;
  setGroup: (g: string | null) => void;
  sort: PlaceSort | null;
  setSort: (s: PlaceSort) => void;
}) {
  return (
    <Modal visible={open} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: COLORS.scrim }}
        onPress={onClose}
        accessibilityLabel="Close filters"
      />
      <View
        style={{
          backgroundColor: COLORS.background,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          padding: 20,
          gap: 10,
        }}
      >
        <Text style={styles.label}>Sort</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {SORTS.map((s) => (
            <Chip
              key={s.key}
              label={s.label}
              active={sort === s.key}
              onPress={() => setSort(s.key)}
            />
          ))}
        </View>
        <Text style={[styles.label, { marginTop: 8 }]}>Category</Text>
        <ScrollView style={{ maxHeight: 220 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Chip label="All" active={group === null} onPress={() => setGroup(null)} />
            {CATEGORY_GROUPS.map((g) => (
              <Chip
                key={g.key}
                label={g.label}
                active={group === g.key}
                onPress={() => setGroup(group === g.key ? null : g.key)}
              />
            ))}
          </View>
        </ScrollView>
        <Button title="Done" onPress={onClose} />
      </View>
    </Modal>
  );
}
