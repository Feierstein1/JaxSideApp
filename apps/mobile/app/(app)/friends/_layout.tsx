import { Stack } from 'expo-router';
import { headerOptions } from '@/ui';

/**
 * D85: the tab's main screen is always underneath, so a screen opened from another tab
 * (e.g. a place from the Friends feed) has a back arrow and the tab returns to its list.
 */
export const unstable_settings = { initialRouteName: 'index' };

export default function FriendsLayout() {
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="index" options={{ title: 'Friends' }} />
      <Stack.Screen name="manage" options={{ title: 'Your friends' }} />
    </Stack>
  );
}
