import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { DARK, type PollView } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { fetchPolls, pollWhen } from '@/polls/api';
import { Text } from '@/text';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { EmptyState, ErrorState, PageTitle, Screen } from '@/ui';

/** D123: the open poll(s) and the archive of closed ones. */
export default function PollsScreen() {
  const [polls, setPolls] = useState<PollView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetchPolls();
      setPolls([...r.open, ...r.closed]);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load polls.');
    }
  }, []);
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
      {!polls ? <ActivityIndicator color={DARK.accent} /> : null}
      {polls && polls.length === 0 ? (
        <EmptyState
          icon="stats-chart-outline"
          title="No polls yet"
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
                {p.status === 'open' ? (p.myChoiceId ? 'You voted · ' : 'Open · ') : ''}
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
