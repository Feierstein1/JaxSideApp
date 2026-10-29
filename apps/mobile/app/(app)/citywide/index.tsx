import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { CONFIG_DEFAULTS, DARK, yardsLabel, type TopicScope, type TopicView } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { StepEdge } from '@/deco';
import { AreaStrip } from '@/location/AreaLabel';
import { fetchTopicPage } from '@/topics/api';
import { TopicCard } from '@/topics/TopicCard';
import { useStartTopic } from '@/topics/useStartTopic';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';
import { Button, ErrorState, FloatingButton, SectionTitle, Segmented } from '@/ui';

/** How many of the newest topics this page shows; the rest are under View all topics. */
const NEWEST = 3;
const LOCAL_RADIUS = yardsLabel(CONFIG_DEFAULTS['topics.localRadiusMiles']);

/**
 * D133: the City Topics page. On black: City / Near me (City first) and Polls. On grey: View
 * all topics, then the three newest open topics of that kind, and + to start one.
 */
export default function CityTopicsScreen() {
  const [scope, setScope] = useState<TopicScope>('city');
  const [topics, setTopics] = useState<TopicView[] | null>(null);
  const [area, setArea] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const start = useStartTopic();

  const load = useCallback(async () => {
    setError(null);
    setTopics(null);
    try {
      const page = await fetchTopicPage({ scope, openOnly: true, limit: NEWEST });
      setTopics(page.topics);
      setArea(page.area ?? null);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load topics.');
    }
  }, [scope]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const local = scope === 'local';
  return (
    <View style={{ flex: 1, backgroundColor: DARK.page }}>
      <View style={{ backgroundColor: DARK.bar, paddingHorizontal: 12, paddingTop: 6, gap: 8 }}>
        <Segmented
          stretch
          options={[
            { key: 'city', label: 'City', icon: 'globe-outline' },
            { key: 'local', label: 'Near me', icon: 'navigate-outline' },
          ]}
          value={scope}
          onChange={(v) => setScope(v as TopicScope)}
        />
        {local ? <AreaStrip area={area} label="Near you" radiusLabel={LOCAL_RADIUS} /> : null}
        <Button
          size="sm"
          variant="secondary"
          icon="stats-chart"
          title="Polls"
          onPress={() => router.push('/citywide/polls')}
          style={{ marginTop: 0, marginBottom: 6 }}
        />
      </View>
      <StepEdge />
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 110, gap: SPACE.sm }}>
        <Button
          variant="secondary"
          icon="list-outline"
          title={local ? 'View all local topics' : 'View all city topics'}
          onPress={() => router.push({ pathname: '/citywide/all', params: { scope } })}
          style={{ marginTop: 0 }}
        />
        <View style={{ marginTop: SPACE.md, marginBottom: SPACE.xs }}>
          <SectionTitle center>{local ? 'Newest near you' : 'Newest topics'}</SectionTitle>
        </View>
        {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
        {!topics && !error ? <ActivityIndicator color={DARK.accent} /> : null}
        {topics && topics.length === 0 ? (
          <Text style={[TYPE.callout, { color: DARK.textMuted, textAlign: 'center' }]}>
            {local
              ? 'No topics within half a mile yet. Start one with +.'
              : 'No open city topics yet. Start one with +.'}
          </Text>
        ) : null}
        {topics?.map((t) => (
          <TopicCard key={t.id} t={t} />
        ))}
      </ScrollView>
      <FloatingButton
        title="Add Topic"
        label={local ? 'Start a topic near you' : 'Start a city topic'}
        onPress={() => void start(scope)}
      />
    </View>
  );
}
