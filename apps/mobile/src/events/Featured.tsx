import { useCallback, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { DARK, type EventCard as EventCardView } from '@jax/shared';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';
import { SectionTitle } from '@/ui';
import { fetchFeatured } from './api';
import { EventCard } from './EventCard';

/**
 * D248: Featured: events their hosts boosted, at the top of the Events tab (guests too),
 * nearest first. Refreshed whenever the screen comes back; nothing shows when there are none.
 */
export function FeaturedSection() {
  const [events, setEvents] = useState<EventCardView[]>([]);
  useFocusEffect(
    useCallback(() => {
      let live = true;
      fetchFeatured()
        .then((list) => live && setEvents(list))
        .catch(() => undefined); // quiet: the calendar below still works
      return () => {
        live = false;
      };
    }, []),
  );
  if (!events.length) return null;
  return (
    <View style={{ gap: SPACE.sm, marginBottom: SPACE.md }}>
      <SectionTitle center>Featured</SectionTitle>
      <Text style={[TYPE.caption, { color: DARK.textMuted, textAlign: 'center' }]}>
        Promoted by their hosts
      </Text>
      {events.map((e) => (
        <EventCard key={e.sessionId} e={e} showDate />
      ))}
    </View>
  );
}
