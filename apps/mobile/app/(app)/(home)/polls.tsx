import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { DARK, POLL_TOPICS, type PollTopic, type PollView } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { fetchPolls, pollWhen } from '@/polls/api';
import { Text } from '@/text';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { EmptyState, ErrorState, PageTitle, Screen } from '@/ui';

const TOPICS = Object.keys(POLL_TOPICS) as PollTopic[];

/** One topic chip (D124). */
function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 7,
        borderRadius: 999,
        backgroundColor: on ? DARK.teal : DARK.raised,
      }}
    >
      <Text style={{ fontSize: 13, fontWeight: '700', color: on ? DARK.onTeal : DARK.text }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** D123 / D124: the open poll(s) and the archive of closed ones, by topic. */
export default function PollsScreen() {
  const [polls, setPolls] = useState<PollView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [topic, setTopic] = useState<PollTopic | undefined>(undefined);
  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetchPolls(topic);
      setPolls([...r.open, ...r.closed]);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load polls.');
    }
  }, [topic]);
  useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  return (
    <Screen>
      <PageTitle
        icon="stats-chart"
        title="Polls"
        subtitle="A question for Jacksonville each week."
      />
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: SPACE.sm, paddingBottom: SPACE.lg }}
      >
        <Chip label="All" on={!topic} onPress={() => setTopic(undefined)} />
        {TOPICS.map((t) => (
          <Chip key={t} label={POLL_TOPICS[t]} on={topic === t} onPress={() => setTopic(t)} />
        ))}
      </ScrollView>
      {!polls ? <ActivityIndicator color={DARK.accent} /> : null}
      {polls && polls.length === 0 ? (
        <EmptyState
          icon="stats-chart-outline"
          title={topic ? `No ${POLL_TOPICS[topic]} polls yet` : 'No polls yet'}
          body="The first one is on its way."
        />
      ) : null}
      <View style={{ gap: SPACE.sm }}>
        {polls?.map((p) => (
          <Pressable
            key={p.id}
            accessibilityRole="button"
            onPress={() => router.push(`/poll/${p.id}`)}
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
              name={p.status === 'open' ? 'checkbox-outline' : 'stats-chart'}
              size={20}
              color={DARK.accent}
            />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontWeight: '700' }} numberOfLines={2}>
                {p.question}
              </Text>
              <Text style={[TYPE.caption, { color: DARK.textMuted }]}>
                {POLL_TOPICS[p.topic]} ·{' '}
                {p.status === 'open' ? (p.myChoiceIds.length ? 'You voted · ' : 'Open · ') : ''}
                {pollWhen(p)}
                {p.results ? ` · ${p.results.voters} voters` : ''}
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={DARK.textMuted} />
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}
