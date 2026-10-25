import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { DARK, TOPIC_CATEGORIES, type TopicCategory, type TopicView } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { fetchTopics } from '@/topics/api';
import { TopicRow } from '@/topics/TopicRow';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';
import { Chip, ErrorState, PageTitle, Screen, SearchField, SectionTitle } from '@/ui';

const CATEGORIES = Object.keys(TOPIC_CATEGORIES) as TopicCategory[];
const newestFirst = (a: TopicView, b: TopicView) => Date.parse(b.opensAt) - Date.parse(a.opensAt);

/**
 * D131: every citywide topic, newest first: search by words and filter by category. Open
 * topics first, then closed ones (still readable).
 */
export default function AllTopicsScreen() {
  const [data, setData] = useState<{ open: TopicView[]; closed: TopicView[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<TopicCategory | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await fetchTopics());
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load topics.');
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const words = q.trim().toLowerCase();
    const match = (t: TopicView) =>
      (!category || t.category === category) &&
      (!words || `${t.title} ${t.description ?? ''}`.toLowerCase().includes(words));
    return {
      open: (data?.open ?? []).filter(match).sort(newestFirst),
      closed: (data?.closed ?? []).filter(match).sort(newestFirst),
    };
  }, [data, q, category]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  const filtered = !!q.trim() || !!category;
  return (
    <Screen>
      <PageTitle icon="list-outline" title="All topics" />
      <View style={{ flexDirection: 'row' }}>
        <SearchField
          label="Search topics"
          placeholder="Search topics"
          value={q}
          onChangeText={setQ}
          maxLength={60}
        />
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: SPACE.sm, paddingVertical: SPACE.md }}
      >
        <Chip label="All" active={!category} onPress={() => setCategory(null)} />
        {CATEGORIES.map((c) => (
          <Chip
            key={c}
            label={TOPIC_CATEGORIES[c]}
            active={category === c}
            onPress={() => setCategory(category === c ? null : c)}
          />
        ))}
      </ScrollView>
      {!data ? <ActivityIndicator color={DARK.accent} /> : null}
      {data && shown.open.length === 0 && shown.closed.length === 0 ? (
        <Text style={[TYPE.callout, { color: DARK.textMuted }]}>
          {filtered ? 'No topics match.' : 'No topics yet.'}
        </Text>
      ) : null}
      <View style={{ gap: SPACE.sm }}>
        {shown.open.map((t) => (
          <TopicRow key={t.id} t={t} />
        ))}
      </View>
      {shown.closed.length ? (
        <>
          <SectionTitle>Closed</SectionTitle>
          <View style={{ gap: SPACE.sm }}>
            {shown.closed.map((t) => (
              <TopicRow key={t.id} t={t} />
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}
