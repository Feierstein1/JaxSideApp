import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import {
  CONFIG_DEFAULTS,
  DARK,
  TOPIC_CATEGORIES,
  yardsLabel,
  type TopicCategory,
  type TopicScope,
  type TopicView,
} from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { useGuest } from '@/auth/guest';
import { StepEdge } from '@/deco';
import { AreaStrip } from '@/location/AreaLabel';
import { fetchTopicPage } from '@/topics/api';
import { TopicCard } from '@/topics/TopicCard';
import { useStartTopic } from '@/topics/useStartTopic';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';
import {
  Button,
  Chip,
  ErrorState,
  FloatingButton,
  IconButton,
  PageTitle,
  SearchField,
  Segmented,
  Sheet,
} from '@/ui';

const CATEGORIES = Object.keys(TOPIC_CATEGORIES) as TopicCategory[];
const LOCAL_RADIUS = yardsLabel(CONFIG_DEFAULTS['topics.localRadiusMiles']);

/**
 * D133: every topic of one kind, 20 at a time. On black: the title (City Topics or Local
 * Topics, which also shows where you are), search, and a filter button (category,
 * topics you follow); then Newest / Oldest. On grey: the cards, and + to start one.
 */
export default function AllTopicsScreen() {
  const params = useLocalSearchParams<{ scope?: string }>();
  const scope: TopicScope = params.scope === 'local' ? 'local' : 'city';
  const { isGuest } = useGuest();
  const start = useStartTopic();
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<TopicCategory | null>(null);
  const [following, setFollowing] = useState(false);
  const [mine, setMine] = useState(false); // D134: My created discussions
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [topics, setTopics] = useState<TopicView[] | null>(null);
  const [next, setNext] = useState<string | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Search waits a moment while typing.
  useEffect(() => {
    const t = setTimeout(() => setQ(typed.trim()), 400);
    return () => clearTimeout(t);
  }, [typed]);

  const query = useCallback(
    (cursor?: string) =>
      fetchTopicPage({
        scope,
        sort,
        ...(q ? { q } : {}),
        ...(category ? { category } : {}),
        ...(following ? { following: true } : {}),
        ...(mine ? { mine: true } : {}),
        ...(cursor ? { cursor } : {}),
      }),
    [scope, sort, q, category, following, mine],
  );

  const load = useCallback(async () => {
    setError(null);
    setTopics(null);
    try {
      const page = await query();
      setTopics(page.topics);
      setNext(page.nextCursor);
      setArea(page.area ?? null);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load topics.');
    }
  }, [query]);
  useEffect(() => {
    void load();
  }, [load]);

  async function loadMore() {
    if (!next || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await query(next);
      setTopics((cur) => [...(cur ?? []), ...page.topics]);
      setNext(page.nextCursor);
    } catch {
      // keep what's shown; the button stays to try again
    } finally {
      setLoadingMore(false);
    }
  }

  const local = scope === 'local';
  const filterCount = (category ? 1 : 0) + (following || mine ? 1 : 0);
  return (
    <View style={{ flex: 1, backgroundColor: DARK.page }}>
      <View style={{ backgroundColor: DARK.bar, paddingHorizontal: 12, paddingTop: 6, gap: 8 }}>
        <PageTitle
          icon={local ? 'navigate-outline' : 'globe-outline'}
          title={local ? 'Local Topics' : 'City Topics'}
        />
        {local ? <AreaStrip area={area} label="Near you" radiusLabel={LOCAL_RADIUS} /> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <SearchField
            compact
            label="Search topics"
            placeholder="Search topics"
            value={typed}
            onChangeText={setTyped}
            maxLength={60}
          />
          <IconButton
            icon="options-outline"
            label={filterCount ? `Filters (${filterCount} on)` : 'Filters'}
            active={filterCount > 0}
            onPress={() => setFiltersOpen(true)}
            size={38}
          />
        </View>
        <View style={{ paddingBottom: 6 }}>
          <Segmented
            compact
            options={[
              { key: 'newest', label: 'Newest', icon: 'arrow-down' },
              { key: 'oldest', label: 'Oldest', icon: 'arrow-up' },
            ]}
            value={sort}
            onChange={(v) => setSort(v as 'newest' | 'oldest')}
          />
        </View>
      </View>
      <StepEdge />
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!topics && !error ? (
        <ActivityIndicator color={DARK.accent} style={{ marginTop: SPACE.lg }} />
      ) : null}
      {topics ? (
        <FlatList
          data={topics}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: 12, paddingBottom: 110, gap: SPACE.sm }}
          renderItem={({ item }) => <TopicCard t={item} />}
          ListEmptyComponent={
            <Text style={[TYPE.callout, { color: DARK.textMuted, textAlign: 'center' }]}>
              {q || category || following || mine
                ? 'No topics match.'
                : local
                  ? 'No topics within half a mile yet.'
                  : 'No city topics yet.'}
            </Text>
          }
          ListFooterComponent={
            next ? (
              <Button
                variant="secondary"
                title="Load more topics"
                onPress={() => void loadMore()}
                busy={loadingMore}
              />
            ) : undefined
          }
        />
      ) : null}
      <FloatingButton
        label={local ? 'Start a topic near you' : 'Start a city topic'}
        onPress={() => start(scope)}
      />

      {/* The filter window: category and (accounts) the topics you follow. */}
      <Sheet open={filtersOpen} onClose={() => setFiltersOpen(false)} title="Filter topics">
        <Text style={[TYPE.label, { marginBottom: SPACE.sm }]}>Category</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
          <Chip label="All" active={!category} onPress={() => setCategory(null)} />
          {CATEGORIES.map((c) => (
            <Chip
              key={c}
              label={TOPIC_CATEGORIES[c]}
              active={category === c}
              onPress={() => setCategory(category === c ? null : c)}
            />
          ))}
        </View>
        {isGuest ? null : (
          <>
            <Text style={[TYPE.label, { marginTop: SPACE.lg, marginBottom: SPACE.sm }]}>Show</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
              <Chip
                label="All topics"
                active={!following && !mine}
                onPress={() => {
                  setFollowing(false);
                  setMine(false);
                }}
              />
              <Chip
                label="I follow"
                icon="bookmark-outline"
                active={following}
                onPress={() => {
                  setFollowing(true);
                  setMine(false);
                }}
              />
              <Chip
                label="I started"
                icon="star-outline"
                active={mine}
                onPress={() => {
                  setMine(true);
                  setFollowing(false);
                }}
              />
            </View>
          </>
        )}
        <Button
          title="Show topics"
          onPress={() => setFiltersOpen(false)}
          style={{ marginTop: SPACE.xl }}
        />
        {filterCount ? (
          <Button
            variant="link"
            title="Clear filters"
            onPress={() => {
              setCategory(null);
              setFollowing(false);
              setMine(false);
            }}
          />
        ) : null}
      </Sheet>
    </View>
  );
}
