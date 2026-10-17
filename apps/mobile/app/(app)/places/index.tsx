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
import { router, Stack } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BRAND, CATEGORY_GROUPS, COLORS, type PlaceSort, type PlaceSummary } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { UserBadge } from '@/auth/UserBadge';
import { categoryLabel, formatDistance, plural } from '@/format';
import { getFreshReading } from '@/location/device';
import { OsmAttribution } from '@/places/Attribution';
import { Button, Chip, styles } from '@/ui';

interface SearchResponse {
  places: PlaceSummary[];
  nextOffset: number | null;
}

const SORTS: { key: PlaceSort; label: string }[] = [
  { key: 'distance', label: 'Nearest' },
  { key: 'name', label: 'A–Z' },
  { key: 'favorites', label: 'Favorites first' },
];

/**
 * P2.16 / D40 / D69: places within a mile, as a list of cards. Search sits in the black
 * bar at the top; sort and category filters open from the filter button next to your
 * name. The server decides eligibility, distance and ordering from a fresh reading.
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
    <View style={{ flex: 1, backgroundColor: COLORS.surfaceMuted }}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={filtered ? 'Filters (on)' : 'Filters'}
                onPress={() => setFiltersOpen(true)}
                hitSlop={10}
              >
                <Ionicons
                  name={filtered ? 'options' : 'options-outline'}
                  size={22}
                  color={BRAND.gold}
                />
              </Pressable>
              <UserBadge />
            </View>
          ),
        }}
      />

      {/* Black search bar under the black header (D69). */}
      <View
        style={{
          backgroundColor: COLORS.surfaceInverse,
          paddingHorizontal: 12,
          paddingBottom: 12,
          paddingTop: 4,
        }}
      >
        <TextInput
          accessibilityLabel="Search places"
          placeholder="Search places within a mile…"
          placeholderTextColor={COLORS.placeholder}
          value={q}
          onChangeText={setQ}
          autoCorrect={false}
          returnKeyType="search"
          style={[
            styles.input,
            { backgroundColor: COLORS.background, borderColor: COLORS.background },
          ]}
        />
      </View>

      {error ? (
        <View style={{ paddingHorizontal: 16, paddingTop: 8 }}>
          <Text style={styles.error}>{error}</Text>
          <Button variant="link" title="Try again" onPress={() => void load(0)} />
        </View>
      ) : null}

      <FlatList
        data={places}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingVertical: 12 }}
        ListHeaderComponent={
          // P5.8: suggest a missing place. Kept apart from the list to avoid mis-taps.
          <View style={{ paddingHorizontal: 12, marginBottom: 22 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add new place"
              onPress={() => router.push('/places/suggest')}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                paddingVertical: 12,
                borderRadius: 10,
                borderWidth: 2,
                borderColor: COLORS.primary,
                backgroundColor: COLORS.background,
              }}
            >
              <Ionicons name="add-circle" size={22} color={COLORS.primary} />
              <Text style={{ color: COLORS.primary, fontWeight: '700', fontSize: 16 }}>
                Add new place
              </Text>
            </Pressable>
          </View>
        }
        renderItem={({ item }) => <PlaceCard place={item} />}
        onEndReached={() => {
          if (!loading && nextOffset !== null) void load(nextOffset);
        }}
        ListEmptyComponent={
          !loading && !error ? (
            <Text style={[styles.muted, { padding: 16 }]}>No places within a mile.</Text>
          ) : null
        }
        ListFooterComponent={
          <>
            {loading ? <ActivityIndicator style={{ margin: 16 }} color={COLORS.primary} /> : null}
            <OsmAttribution />
          </>
        }
      />

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

/** One place (D69): black header with a white category pill and the name; then distance and posts. */
function PlaceCard({ place }: { place: PlaceSummary }) {
  const long = place.name.length > 20;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${place.name}, ${categoryLabel(place.category)}, ${formatDistance(place.distanceMeters)} away, ${plural(place.postCount, 'post')}`}
      onPress={() => router.push(`/places/${place.id}`)}
      style={({ pressed }) => ({
        marginHorizontal: 12,
        marginVertical: 4,
        borderRadius: 10,
        overflow: 'hidden',
        backgroundColor: COLORS.background,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        opacity: pressed ? 0.9 : 1,
      })}
    >
      <View
        style={{
          backgroundColor: COLORS.surfaceInverse,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 12,
          paddingVertical: 10,
        }}
      >
        <View
          style={{
            backgroundColor: COLORS.background,
            borderRadius: 999,
            paddingHorizontal: 10,
            paddingVertical: 3,
          }}
        >
          <Text style={{ color: COLORS.text, fontSize: 12, fontWeight: '700' }}>
            {categoryLabel(place.category)}
          </Text>
        </View>
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
          style={{
            flex: 1,
            color: COLORS.onSurfaceInverse,
            fontWeight: '700',
            fontSize: long ? 15 : 17,
          }}
        >
          {place.name}
        </Text>
        {place.isFavorite ? (
          <Ionicons name="star" size={16} color={BRAND.gold} accessibilityLabel="Favorite" />
        ) : null}
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          paddingHorizontal: 12,
          paddingVertical: 9,
        }}
      >
        <Text style={{ color: COLORS.text, fontWeight: '600' }}>
          {formatDistance(place.distanceMeters)}
        </Text>
        <Text
          style={{
            color: place.postCount > 0 ? COLORS.primary : COLORS.textMuted,
            fontWeight: '600',
          }}
        >
          {place.postCount > 0 ? plural(place.postCount, 'post') : 'No posts yet'}
        </Text>
      </View>
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
        <ScrollView horizontal={false} style={{ maxHeight: 220 }}>
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
