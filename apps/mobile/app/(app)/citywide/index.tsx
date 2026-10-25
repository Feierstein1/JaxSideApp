import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { DARK, type TopicView } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { fetchTopics } from '@/topics/api';
import { TopicRow } from '@/topics/TopicRow';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';
import { Button, ErrorState, PageTitle, Screen, SectionTitle } from '@/ui';

/** How many of the newest topics this page shows; the rest are under View all topics. */
const NEWEST = 3;

/**
 * D130 / D131: the Citywide tab. Suggest a topic and Polls at the top, then the three newest
 * open topics, then View all topics (search and filter by category).
 */
export default function CitywideScreen() {
  const [topics, setTopics] = useState<TopicView[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetchTopics();
      setTopics([...r.open].sort((a, b) => Date.parse(b.opensAt) - Date.parse(a.opensAt)));
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load topics.');
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  return (
    <Screen>
      <PageTitle
        icon="globe-outline"
        title="Citywide"
        subtitle="Conversations for all of Jacksonville. Anyone in Duval County can join."
      />
      <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
        <Button
          size="sm"
          icon="add-circle-outline"
          title="Suggest a topic"
          onPress={() => router.push('/citywide/suggest')}
          style={{ flex: 1, marginTop: 0 }}
        />
        <Button
          size="sm"
          variant="secondary"
          icon="stats-chart"
          title="Polls"
          onPress={() => router.push('/polls')}
          style={{ marginTop: 0 }}
        />
      </View>

      <View style={{ marginTop: SPACE.xl, marginBottom: SPACE.md }}>
        <SectionTitle center>Newest topics</SectionTitle>
      </View>
      {!topics ? <ActivityIndicator color={DARK.accent} /> : null}
      {topics && topics.length === 0 ? (
        <Text style={[TYPE.callout, { color: DARK.textMuted, textAlign: 'center' }]}>
          No open topics right now. Suggest one!
        </Text>
      ) : null}
      <View style={{ gap: SPACE.sm }}>
        {topics?.slice(0, NEWEST).map((t) => (
          <TopicRow key={t.id} t={t} />
        ))}
      </View>
      <Button
        variant="secondary"
        icon="list-outline"
        title="View all topics"
        onPress={() => router.push('/citywide/all')}
        style={{ marginTop: SPACE.lg }}
      />
    </Screen>
  );
}
