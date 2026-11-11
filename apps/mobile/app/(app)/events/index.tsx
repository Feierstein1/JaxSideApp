import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  addMonths,
  dateLabel,
  DARK,
  localDate,
  type EventCard as EventCardView,
} from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { useGuest } from '@/auth/guest';
import { StepEdge } from '@/deco';
import { fetchList, fetchMonth } from '@/events/api';
import { Calendar } from '@/events/Calendar';
import { EventCard } from '@/events/EventCard';
import { EventFilterBar, useEventFilters } from '@/events/EventFilters';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';
import { Button, EmptyState, ErrorState, FloatingButton, Segmented } from '@/ui';

type View_ = 'list' | 'calendar';

/**
 * D230: the Events tab. Search and filters on black, then a List (what's coming up, soonest
 * first, grouped by day, "Load more" instead of endless scrolling, D112) or a Calendar
 * (a month of equal squares with each day's count; tap a day for its events).
 */
export default function EventsScreen() {
  const [view, setView] = useState<View_>('list');
  const [filters] = useEventFilters();
  const { isGuest, promptAccount } = useGuest();

  // List view
  const [items, setItems] = useState<EventCardView[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  // Calendar view
  const [month, setMonth] = useState(() => localDate(new Date()).slice(0, 7));
  const [days, setDays] = useState<Record<string, number> | null>(null);
  const [today, setToday] = useState(() => localDate(new Date()));
  const [error, setError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setError(null);
    setItems(null);
    try {
      const page = await fetchList(filters);
      setItems(page.items);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load events.');
    }
  }, [filters]);

  const loadMonth = useCallback(async () => {
    setError(null);
    setDays(null);
    try {
      const r = await fetchMonth(month, filters);
      setDays(r.days);
      setToday(r.today);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load the calendar.');
    }
  }, [month, filters]);

  const load = view === 'list' ? loadList : loadMonth;
  // Runs on focus, and again whenever the filters, the month or the view change.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function loadMore() {
    if (!cursor) return;
    setMore(true);
    try {
      const page = await fetchList(filters, cursor);
      setItems((cur) => [...(cur ?? []), ...page.items]);
      setCursor(page.nextCursor);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load more events.');
    } finally {
      setMore(false);
    }
  }

  const suggest = () =>
    isGuest ? promptAccount('suggest events') : router.push('/events/suggest');

  return (
    <View style={{ flex: 1, backgroundColor: DARK.page }}>
      <View
        style={{
          backgroundColor: DARK.bar,
          paddingHorizontal: 12,
          paddingTop: 6,
          gap: 8,
          paddingBottom: 8,
        }}
      >
        <EventFilterBar />
        <Segmented
          stretch
          options={[
            { key: 'list', label: 'List', icon: 'list-outline' },
            { key: 'calendar', label: 'Calendar', icon: 'calendar-outline' },
          ]}
          value={view}
          onChange={(v) => setView(v as View_)}
        />
      </View>
      <StepEdge />
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 110, gap: SPACE.sm }}>
        {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
        {view === 'calendar' ? (
          <>
            <Calendar
              month={month}
              today={today}
              days={days}
              onMonth={(step) => setMonth((m) => addMonths(m, step))}
              onDay={(date) => router.push(`/events/day/${date}`)}
            />
            {!days && !error ? <ActivityIndicator color={DARK.accent} /> : null}
            <Text style={[TYPE.caption, { color: DARK.textMuted, textAlign: 'center' }]}>
              Tap a day to see its events.
            </Text>
          </>
        ) : (
          <EventList items={items} error={!!error} onSuggest={suggest} />
        )}
        {view === 'list' && cursor ? (
          <Button
            variant="secondary"
            icon="chevron-down"
            title="Load more events"
            busy={more}
            onPress={() => void loadMore()}
          />
        ) : null}
        {!isGuest ? (
          <Button
            variant="link"
            title="My suggestions"
            onPress={() => router.push('/events/suggestions')}
          />
        ) : null}
      </ScrollView>
      <FloatingButton title="Suggest" label="Suggest an event" icon="add" onPress={suggest} />
    </View>
  );
}

/** Upcoming events with a heading for each day. */
function EventList({
  items,
  error,
  onSuggest,
}: {
  items: EventCardView[] | null;
  error: boolean;
  onSuggest: () => void;
}) {
  if (!items) return error ? null : <ActivityIndicator color={DARK.accent} />;
  if (!items.length) {
    return (
      <EmptyState
        icon="calendar-outline"
        title="No events found"
        body="Try other filters, or tell us about an event that’s missing."
        action={{ label: 'Suggest an event', onPress: onSuggest, icon: 'add' }}
      />
    );
  }
  return (
    <>
      {items.map((e, i) => (
        <View key={e.sessionId} style={{ gap: SPACE.sm }}>
          {i === 0 || items[i - 1]!.date !== e.date ? (
            <Text
              accessibilityRole="header"
              style={[TYPE.overline, { color: DARK.textMuted, marginTop: i ? SPACE.md : 0 }]}
            >
              {e.date === localDate(new Date()) ? 'Today' : dateLabel(e.date)}
            </Text>
          ) : null}
          <EventCard e={e} />
        </View>
      ))}
    </>
  );
}
