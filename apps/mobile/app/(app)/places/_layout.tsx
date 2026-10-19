import { Stack } from 'expo-router';
import { headerOptions } from '@/ui';

/**
 * D85: the tab's main screen is always underneath, so a screen opened from another tab
 * (e.g. a place from the Friends feed) has a back arrow and the tab returns to its list.
 */
export const unstable_settings = { initialRouteName: 'index' };

export default function PlacesLayout() {
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="index" options={{ title: 'Places' }} />
      <Stack.Screen name="[id]" options={{ title: 'Place' }} />
      <Stack.Screen name="post/[id]" options={{ title: 'Post' }} />
      <Stack.Screen name="suggest" options={{ title: 'Suggest a place' }} />
      <Stack.Screen name="compose" options={{ title: 'New post', presentation: 'modal' }} />
    </Stack>
  );
}
