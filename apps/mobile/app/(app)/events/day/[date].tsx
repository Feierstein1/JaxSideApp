import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { dateLabel, DARK, isValidDate, type EventDay } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { fetchDay } from '@/events/api';
import { EventCard } from '@/events/EventCard';
import { EventFilterBar, useEventFilters } from '@/events/EventFilters';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';
import { EmptyState, ErrorState, PageTitle } from '@/ui';

/**
 * D230: one day's events (tapped on the calendar), grouped by neighborhood and ZIP: yours and
 * the nearest first, then by start time inside each. Same search and filters as the tab.
 */
export default function EventDayScreen() {
  const { date } = useLocalSearchParams<{ date: string }>();
  const [filters] = useEventFilters();
  const [data, setData] = useState<EventDay | null>(null);
  const [error, setError] = useState<string | null>(null);
  const valid = typeof date === 'string' && isValidDate(date);

  const load = useCallback(async () => {
    if (!valid) return;
    setError(null);
    setData(null);
    try {
      setData(await fetchDay(date, filters));
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load this day.');
    }
  }, [date, filters, valid]);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!valid) return <ErrorState message="That day couldn’t be opened." />;
  const count = data?.groups.reduce((n, g) => n + g.events.length, 0) ?? 0;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: DARK.page }}
      contentContainerStyle={{ padding: 12, paddingBottom: 48, gap: SPACE.sm }}
    >
      <PageTitle
        icon="calendar"
        title={data && date === data.today ? `Today, ${dateLabel(date)}` : dateLabel(date)}
        subtitle={data ? (count === 1 ? '1 event' : `${count} events`) : undefined}
      />
      <EventFilterBar />
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!data && !error ? <ActivityIndicator color={DARK.accent} /> : null}
      {data && !data.groups.length ? (
        <EmptyState
          icon="calendar-outline"
          title="Nothing on this day"
          body="Try another day, or loosen the filters."
        />
      ) : null}
      {data?.groups.map((g) => (
        <View key={`${g.neighborhood}|${g.zip}`} style={{ gap: SPACE.sm, marginTop: SPACE.md }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Ionicons name="location" size={15} color={DARK.accent} />
            <Text accessibilityRole="header" style={[TYPE.label, { flex: 1 }]}>
              {g.neighborhood ?? 'Jacksonville'}
              {g.zip ? (
                <Text style={{ color: DARK.textMuted, fontWeight: '600' }}>{`  ${g.zip}`}</Text>
              ) : null}
            </Text>
          </View>
          {g.events.map((e) => (
            <EventCard key={e.sessionId} e={e} />
          ))}
        </View>
      ))}
    </ScrollView>
  );
}
