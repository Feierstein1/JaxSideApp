import { Stack } from 'expo-router';
import { headerOptions } from '@/ui';

/**
 * D130 / D133: the Topics tab: City Topics, all topics, a topic, its posts, starting a topic,
 * and polls (so Back from a poll returns here). The City Topics page is always underneath.
 */
export const unstable_settings = { initialRouteName: 'index' };

export default function TopicsLayout() {
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="index" options={{ title: 'City Topics' }} />
      <Stack.Screen name="all" options={{ title: 'All topics' }} />
      <Stack.Screen name="topic/[id]" options={{ title: 'Topic' }} />
      <Stack.Screen name="post/[id]" options={{ title: 'Post' }} />
      <Stack.Screen name="new" options={{ title: 'Start a topic' }} />
      <Stack.Screen name="compose" options={{ title: 'New post', presentation: 'modal' }} />
      <Stack.Screen name="polls" options={{ title: 'Polls' }} />
      <Stack.Screen name="poll/[id]" options={{ title: 'Poll' }} />
      <Stack.Screen name="suggest-poll" options={{ title: 'Suggest a poll' }} />
    </Stack>
  );
}
