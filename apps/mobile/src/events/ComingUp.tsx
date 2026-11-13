import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { DARK, localDate, timeLabel, type EventCard as EventCardView } from '@jax/shared';
import { useAuth } from '@/auth/AuthContext';
import { useGuest } from '@/auth/guest';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';
import { SectionTitle } from '@/ui';
import { fetchComingUp } from './api';
import { EventCard } from './EventCard';

/** "Today at 7:00 PM" / "Tomorrow at 7:00 PM" / "Happening now". */
function whenLabel(e: EventCardView, today: string) {
  if (e.happeningNow) return 'Happening now';
  return `${e.date === today ? 'Today' : 'Tomorrow'} at ${timeLabel(e.startTime)}`;
}

/** The followed events on today or tomorrow, refreshed whenever the screen comes back. */
function useComingUp(reloadKey?: string) {
  const { state } = useAuth();
  const { isGuest } = useGuest();
  const signedIn = state.status === 'signedIn' && !isGuest;
  const [events, setEvents] = useState<EventCardView[]>([]);
  useFocusEffect(
    useCallback(() => {
      if (!signedIn) return;
      let live = true;
      fetchComingUp()
        .then((list) => live && setEvents(list))
        .catch(() => undefined); // quiet: it's only a reminder
      return () => {
        live = false;
      };
    }, [signedIn, reloadKey]), // reloadKey: Home's refresh reloads it too
  );
  return signedIn ? events : [];
}

/**
 * D241: a quiet reminder on Home for events you follow that are today or tomorrow (phone
 * notifications aren't on yet). One line under the chat bar; tapping it opens the event (or
 * the Events tab when there are several). Nothing shows when there's nothing coming up.
 */
export function ComingUpBar({ reloadKey }: { reloadKey?: string }) {
  const events = useComingUp(reloadKey);
  const live = events.filter((e) => !e.cancelled);
  if (!live.length) return null;
  const first = live[0]!;
  const today = localDate(new Date());
  const more = live.length - 1;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Coming up: ${first.title}, ${whenLabel(first, today)}${more ? `, and ${more} more` : ''}`}
      onPress={() =>
        live.length === 1 ? router.push(`/events/event/${first.id}`) : router.push('/events')
      }
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.sm,
        paddingHorizontal: SPACE.md,
        paddingVertical: 8,
        backgroundColor: DARK.tealSoft,
        borderBottomWidth: 1,
        borderBottomColor: DARK.hairline,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Ionicons name="calendar" size={16} color={DARK.accent} />
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 13.5 }}>
        <Text style={{ fontWeight: '800', color: DARK.tealText }}>{whenLabel(first, today)}: </Text>
        <Text style={{ fontWeight: '700' }}>{first.title}</Text>
        {more ? <Text style={{ color: DARK.textMuted }}>{`  +${more} more`}</Text> : null}
      </Text>
      <Ionicons name="chevron-forward" size={16} color={DARK.textMuted} />
    </Pressable>
  );
}

/** D241: the same reminder at the top of the Events tab, as cards. */
export function ComingUpSection() {
  const events = useComingUp();
  if (!events.length) return null;
  return (
    <View style={{ gap: SPACE.sm, marginBottom: SPACE.md }}>
      <SectionTitle center>Coming up</SectionTitle>
      <Text style={[TYPE.caption, { color: DARK.textMuted, textAlign: 'center' }]}>
        Events you follow, today and tomorrow
      </Text>
      {events.map((e) => (
        <EventCard key={e.sessionId} e={e} showDate />
      ))}
    </View>
  );
}
