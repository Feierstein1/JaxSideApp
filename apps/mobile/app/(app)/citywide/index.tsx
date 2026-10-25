import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { DARK, type TopicView } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { fetchTopics, topicActivity } from '@/topics/api';
import { Text } from '@/text';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { Button, ErrorState, PageTitle, Screen, SearchField, SectionTitle, Segmented } from '@/ui';

type Sort = 'newest' | 'active' | 'posts';

const SORTERS: Record<Sort, (a: TopicView, b: TopicView) => number> = {
  newest: (a, b) => Date.parse(b.opensAt) - Date.parse(a.opensAt),
  active: (a, b) => Date.parse(b.lastPostAt ?? b.opensAt) - Date.parse(a.lastPostAt ?? a.opensAt),
  posts: (a, b) => b.postCount - a.postCount,
};

function Row({ t }: { t: TopicView }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/citywide/topic/${t.id}`)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.md,
        padding: SPACE.md,
        borderRadius: RADIUS.lg,
        backgroundColor: DARK.card,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Ionicons
        name={
          t.status === 'closed' ? 'lock-closed-outline' : t.pinned ? 'pin' : 'chatbubbles-outline'
        }
        size={19}
        color={t.status === 'closed' ? DARK.textMuted : DARK.accent}
      />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontWeight: '700' }} numberOfLines={2}>
          {t.title}
        </Text>
        {t.description ? (
          <Text numberOfLines={1} style={[TYPE.caption, { color: DARK.textMuted }]}>
            {t.description}
          </Text>
        ) : null}
        <Text style={[TYPE.caption, { color: DARK.textMuted }]}>{topicActivity(t)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={DARK.textMuted} />
    </Pressable>
  );
}

/**
 * D125 / D126: every citywide topic, searchable and sortable (newest, most active, most
 * posts): open ones first, then closed ones. Suggest a new topic; past polls are here too.
 */
export default function TopicsScreen() {
  const [data, setData] = useState<{ open: TopicView[]; closed: TopicView[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
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
      !words || `${t.title} ${t.description ?? ''}`.toLowerCase().includes(words);
    return {
      open: (data?.open ?? []).filter(match).sort(SORTERS[sort]),
      closed: (data?.closed ?? []).filter(match).sort(SORTERS[sort]),
    };
  }, [data, q, sort]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  return (
    <Screen>
      <PageTitle
        icon="globe-outline"
        title="Citywide topics"
        subtitle="Conversations for all of Jacksonville. Anyone in Duval County can join."
      />
      <View style={{ gap: SPACE.sm, marginBottom: SPACE.lg }}>
        <SearchField
          label="Search topics"
          placeholder="Search topics"
          value={q}
          onChangeText={setQ}
          maxLength={60}
        />
        <Segmented
          small
          stretch
          options={[
            { key: 'newest', label: 'Newest', icon: 'sparkles-outline' },
            { key: 'active', label: 'Most active', icon: 'flame-outline' },
            { key: 'posts', label: 'Most posts', icon: 'chatbubbles-outline' },
          ]}
          value={sort}
          onChange={(v) => setSort(v as Sort)}
        />
      </View>
      {!data ? <ActivityIndicator color={DARK.accent} /> : null}
      {data && shown.open.length === 0 ? (
        <Text style={[TYPE.callout, { color: DARK.textMuted, marginBottom: SPACE.md }]}>
          {q.trim() ? `No open topics match “${q.trim()}”.` : 'No open topics right now.'}
        </Text>
      ) : null}
      <View style={{ gap: SPACE.sm }}>
        {shown.open.map((t) => (
          <Row key={t.id} t={t} />
        ))}
      </View>
      {shown.closed.length ? (
        <>
          <SectionTitle>Closed</SectionTitle>
          <View style={{ gap: SPACE.sm }}>
            {shown.closed.map((t) => (
              <Row key={t.id} t={t} />
            ))}
          </View>
        </>
      ) : null}
      <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.xl }}>
        <Button
          variant="secondary"
          icon="add-circle-outline"
          title="Suggest a topic"
          onPress={() => router.push('/citywide/suggest')}
          style={{ flex: 1 }}
        />
        <Button
          variant="secondary"
          icon="stats-chart"
          title="Polls"
          onPress={() => router.push('/polls')}
          style={{ flex: 1 }}
        />
      </View>
    </Screen>
  );
}
