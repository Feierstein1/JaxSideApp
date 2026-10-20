import { Stack } from 'expo-router';
import { headerOptions } from '@/ui';

/** D85: the list is always underneath a chat opened from elsewhere. */
export const unstable_settings = { initialRouteName: 'index' };

export default function MessagesLayout() {
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="index" options={{ title: 'Messages' }} />
      <Stack.Screen name="[username]" options={{ title: 'Chat' }} />
    </Stack>
  );
}
