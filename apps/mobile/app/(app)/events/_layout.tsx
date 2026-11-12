import { Stack } from 'expo-router';
import { headerOptions } from '@/ui';

/**
 * D230: the Events tab: the calendar / list, a day's events, an event, and how to post one
 * (D233: on JaxSide for Business). The Events page is always underneath.
 */
export const unstable_settings = { initialRouteName: 'index' };

export default function EventsLayout() {
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="index" options={{ title: 'Events' }} />
      <Stack.Screen name="day/[date]" options={{ title: 'Day' }} />
      <Stack.Screen name="event/[id]" options={{ title: 'Event' }} />
      <Stack.Screen name="host" options={{ title: 'Post an event' }} />
      {/* D230: full screen, no tab bar (the app layout hides it on chat screens). */}
      <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
