import { Stack } from 'expo-router';
import { headerOptions } from '@/ui';

/**
 * D130: the Citywide tab: every citywide topic, a topic's discussion, suggesting a topic,
 * writing and reading posts. The topic list is always underneath (like Places, D85).
 */
export const unstable_settings = { initialRouteName: 'index' };

export default function CitywideLayout() {
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="index" options={{ title: 'Citywide' }} />
      <Stack.Screen name="all" options={{ title: 'All topics' }} />
      <Stack.Screen name="topic/[id]" options={{ title: 'Topic' }} />
      <Stack.Screen name="post/[id]" options={{ title: 'Post' }} />
      <Stack.Screen name="suggest" options={{ title: 'Suggest a topic' }} />
      <Stack.Screen name="compose" options={{ title: 'New post', presentation: 'modal' }} />
    </Stack>
  );
}
