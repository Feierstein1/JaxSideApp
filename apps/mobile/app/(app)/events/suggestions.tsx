import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { DARK, type MyEventSuggestion } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { mySuggestions } from '@/events/api';
import { Tag } from '@/events/EventCard';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';
import { Card, EmptyState, ErrorState, PageTitle, Screen } from '@/ui';

const LABEL = { waiting: 'Waiting for review', approved: 'On the calendar', denied: 'Not added' };

/** D230: the events you suggested and what happened to each. */
export default function MyEventSuggestions() {
  const [list, setList] = useState<MyEventSuggestion[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      setList(await mySuggestions());
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load your suggestions.');
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );
  return (
    <Screen>
      <PageTitle title="My event suggestions" icon="calendar-outline" />
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!list && !error ? <ActivityIndicator color={DARK.accent} /> : null}
      {list && !list.length ? (
        <EmptyState
          icon="calendar-outline"
          title="No suggestions yet"
          body="Know about an event that isn’t on the calendar? Suggest it from the Events tab."
          action={{ label: 'Suggest an event', onPress: () => router.replace('/events/suggest') }}
        />
      ) : null}
      <View style={{ gap: SPACE.sm }}>
        {list?.map((s) => (
          <Card key={s.id}>
            <Text style={TYPE.label}>{s.title}</Text>
            <View style={{ flexDirection: 'row', marginTop: 6 }}>
              <Tag
                text={LABEL[s.status]}
                tone={
                  s.status === 'approved' ? 'accent' : s.status === 'denied' ? 'alert' : 'muted'
                }
              />
            </View>
            {s.reason ? (
              <Text style={[TYPE.caption, { color: DARK.textMuted, marginTop: 6 }]}>
                {s.reason}
              </Text>
            ) : null}
          </Card>
        ))}
      </View>
    </Screen>
  );
}
