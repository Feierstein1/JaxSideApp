import { Stack } from 'expo-router';
import { headerOptions } from '@/ui';

/**
 * D85: the tab's main screen is always underneath, so a screen opened from another tab
 * (e.g. a place from the Friends feed) has a back arrow and the tab returns to its list.
 */
export const unstable_settings = { initialRouteName: 'index' };

export default function HomeLayout() {
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="index" options={{ title: 'JaxSide' }} />
      <Stack.Screen name="post/[id]" options={{ title: 'Post' }} />
      <Stack.Screen name="user/[username]" options={{ title: 'Profile' }} />
      <Stack.Screen name="compose" options={{ title: 'New post', presentation: 'modal' }} />
      <Stack.Screen name="poll/[id]" options={{ title: 'Poll' }} />
      <Stack.Screen name="polls" options={{ title: 'Polls' }} />
      <Stack.Screen name="topic/[id]" options={{ title: 'Topic' }} />
      <Stack.Screen name="topics" options={{ title: 'Citywide topics' }} />
      <Stack.Screen name="suggest-topic" options={{ title: 'Suggest a topic' }} />
    </Stack>
  );
}
