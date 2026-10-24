import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { DARK, type TopicView } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { fetchTopics, topicActivity } from '@/topics/api';
import { Text } from '@/text';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { Button, ErrorState, PageTitle, Screen, SectionTitle } from '@/ui';

function Row({ t }: { t: TopicView }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/topic/${t.id}`)}
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
        <Text style={[TYPE.caption, { color: DARK.textMuted }]}>{topicActivity(t)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={DARK.textMuted} />
    </Pressable>
  );
}

/** D125: every citywide topic: open ones first, then closed ones; suggest a new one. */
export default function TopicsScreen() {
  const [data, setData] = useState<{ open: TopicView[]; closed: TopicView[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
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

  if (error) return <ErrorState message={error} onRetry={() => void load()} />;
  return (
    <Screen>
      <PageTitle
        icon="globe-outline"
        title="Citywide topics"
        subtitle="Conversations for all of Jacksonville. Anyone in Duval County can join."
      />
      <Button
        variant="secondary"
        icon="add-circle-outline"
        title="Suggest a topic"
        onPress={() => router.push('/suggest-topic')}
        style={{ marginBottom: SPACE.lg }}
      />
      {!data ? <ActivityIndicator color={DARK.accent} /> : null}
      {data && data.open.length === 0 ? (
        <Text style={[TYPE.callout, { color: DARK.textMuted }]}>
          No open topics right now. Suggest one!
        </Text>
      ) : null}
      <View style={{ gap: SPACE.sm }}>
        {data?.open.map((t) => (
          <Row key={t.id} t={t} />
        ))}
      </View>
      {data?.closed.length ? (
        <>
          <SectionTitle>Closed</SectionTitle>
          <View style={{ gap: SPACE.sm }}>
            {data.closed.map((t) => (
              <Row key={t.id} t={t} />
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}
