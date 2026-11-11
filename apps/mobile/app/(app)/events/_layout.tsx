import { Stack } from 'expo-router';
import { headerOptions } from '@/ui';

/**
 * D230: the Events tab: the list / calendar, a day's events, an event, suggesting one, and your
 * suggestions. The Events page is always underneath.
 */
export const unstable_settings = { initialRouteName: 'index' };

export default function EventsLayout() {
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="index" options={{ title: 'Events' }} />
      <Stack.Screen name="day/[date]" options={{ title: 'Day' }} />
      <Stack.Screen name="event/[id]" options={{ title: 'Event' }} />
      <Stack.Screen name="suggest" options={{ title: 'Suggest an event' }} />
      <Stack.Screen name="suggestions" options={{ title: 'My suggestions' }} />
      {/* D230: full screen, no tab bar (the app layout hides it on chat screens). */}
      <Stack.Screen name="chat/[id]" options={{ headerShown: false }} />
    </Stack>
  );
}
