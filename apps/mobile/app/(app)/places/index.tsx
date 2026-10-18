import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, ScrollView, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { CATEGORY_GROUPS, COLORS, type PlaceSort, type PlaceSummary } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { categoryLabel, formatDistance, plural } from '@/format';
import { getFreshReading, noteListLoad, useReloadWhenMoved } from '@/location/device';
import { AreaTitle } from '@/location/AreaLabel';
import { OsmAttribution } from '@/places/Attribution';
import {
  categoryIcon,
  PlaceSkeleton,
  PlaceStats,
  PlaceTop,
  placeFrame,
} from '@/places/PlaceHeader';
import { refreshLimiter } from '@/refresh-limit';
import { elevation, TYPE } from '@/tokens';
import {
  Button,
  Chip,
  EmptyState,
  ErrorState,
  FloatingButton,
  IconButton,
  PressableScale,
  RefreshButton,
  SearchField,
  Sheet,
} from '@/ui';

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
  { key: 'popular', label: 'Most favorited' },
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
    async (offset = 0, fresh = false) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(undefined);
      try {
        const reading = await getFreshReading({ fresh });
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
        if (offset === 0) {
          setArea(res.area ?? null);
          noteListLoad(); // D77
        }
      } catch (e) {
        if (id !== requestId.current) return;
        if (offset === 0) {
          setPlaces([]); // D77: never leave another spot's places looking current
          setNextOffset(null);
          setArea(null);
        }
        setError(e instanceof ApiRequestError ? e.message : 'Couldn’t get your location.');
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [q, group, sort],
  );

  // D73: reload with a new fix when the app is reopened somewhere new.
  useReloadWhenMoved(() => void load(0));

  // Reload when anything changes; wait a moment while the user is typing.
  useEffect(() => {
    const t = setTimeout(() => void load(0), q ? 400 : 0);
    return () => clearTimeout(t);
  }, [load, q]);

  const groupLabel = CATEGORY_GROUPS.find((g) => g.key === group)?.label;
  const sortLabel = sort && sort !== 'distance' ? SORTS.find((x) => x.key === sort)?.label : null;

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surfaceDark }}>
      <Stack.Screen options={{ headerTitle: () => <AreaTitle title="Places" area={area} /> }} />
      {/* Black bar under the black header: filters, search, refresh (D70, D78). */}
      <View
        style={{
          backgroundColor: COLORS.surfaceInverse,
          paddingHorizontal: 12,
          paddingTop: 2,
          paddingBottom: 12,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <IconButton
          icon="options-outline"
          label={filtered ? 'Filters (on)' : 'Filters'}
          active={filtered}
          onPress={() => setFiltersOpen(true)}
        />
        <SearchField
          label="Search places"
          placeholder="Search places nearby"
          value={q}
          onChangeText={setQ}
          autoCapitalize="words"
        />
        <RefreshButton
          onPress={() => {
            const wait = refreshLimiter.tap(); // D74: 30 a minute
            if (wait) Alert.alert('Slow down a little', `You can refresh again in ${wait} s.`);
            else void load(0, true);
          }}
          busy={loading && places.length > 0}
        />
      </View>

      <FlatList
        data={places}
        keyExtractor={(p) => p.id}
        contentContainerStyle={{ paddingTop: 6, paddingBottom: 104, flexGrow: 1 }}
        renderItem={({ item }) => <PlaceCard place={item} />}
        onEndReached={() => {
          if (!loading && nextOffset !== null) void load(nextOffset);
        }}
        ListHeaderComponent={
          <>
            {/* D78: what's applied, each removable with one tap. */}
            {groupLabel || sortLabel ? (
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 8,
                  paddingHorizontal: 12,
                  paddingTop: 6,
                  paddingBottom: 4,
                }}
              >
                {groupLabel ? (
                  <Chip
                    dark
                    active
                    label={groupLabel}
                    onPress={() => setGroup(null)}
                    onRemove={() => setGroup(null)}
                  />
                ) : null}
                {sortLabel ? (
                  <Chip
                    dark
                    active
                    label={sortLabel}
                    onPress={() => setSort(null)}
                    onRemove={() => setSort(null)}
                  />
                ) : null}
              </View>
            ) : null}
            {error ? <ErrorState dark message={error} onRetry={() => void load(0)} /> : null}
          </>
        }
        ListEmptyComponent={
          loading && places.length === 0 ? (
            <View>
              <PlaceSkeleton />
              <PlaceSkeleton />
              <PlaceSkeleton />
              <PlaceSkeleton />
            </View>
          ) : !error ? (
            <EmptyState
              dark
              icon={q || filtered ? 'search-outline' : 'storefront-outline'}
              title={q || filtered ? 'No matching places nearby' : 'No places within your radius'}
              body={
                q || filtered
                  ? 'Try another name or clear the filters.'
                  : 'You can widen your radius in Account → Settings, or add a place that’s missing.'
              }
              action={{
                label: 'Suggest a place',
                icon: 'add',
                onPress: () => router.push('/places/suggest'),
              }}
            />
          ) : null
        }
        ListFooterComponent={
          <>
            {loading && places.length > 0 ? (
              <ActivityIndicator style={{ margin: 16 }} color={COLORS.accent} />
            ) : null}
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

/** One place (D69, D70, D78): category-colored header + distance, favorites and posts. */
function PlaceCard({ place }: { place: PlaceSummary }) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={`${place.name}, ${categoryLabel(place.category)}, ${formatDistance(place.distanceMeters)} away, ${plural(place.postCount, 'post')}, ${plural(place.favoriteCount, 'favorite')}`}
      onPress={() => router.push(`/places/${place.id}`)}
      scaleTo={0.98}
      style={[placeFrame, elevation(1)]}
    >
      <PlaceTop place={place} />
      <PlaceStats place={place} chevron />
    </PressableScale>
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
  setSort: (s: PlaceSort | null) => void;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="Sort & filter">
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 4, gap: 10 }}>
        <Text style={[TYPE.overline, { color: COLORS.textMuted }]}>Sort by</Text>
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
        <Text style={[TYPE.overline, { color: COLORS.textMuted, marginTop: 10 }]}>Category</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Chip label="All" active={group === null} onPress={() => setGroup(null)} />
          {CATEGORY_GROUPS.map((g) => (
            <Chip
              key={g.key}
              label={g.label}
              icon={categoryIcon(g.categories[0])}
              active={group === g.key}
              onPress={() => setGroup(group === g.key ? null : g.key)}
            />
          ))}
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <Button
            variant="secondary"
            title="Reset"
            onPress={() => {
              setGroup(null);
              setSort(null);
            }}
            style={{ flex: 1 }}
          />
          <Button title="Show places" onPress={onClose} style={{ flex: 2 }} />
        </View>
      </ScrollView>
    </Sheet>
  );
}
