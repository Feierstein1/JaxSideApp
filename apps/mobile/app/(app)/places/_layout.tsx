import { Stack } from 'expo-router';
import { headerOptions } from '@/ui';

export default function PlacesLayout() {
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="index" options={{ title: 'Places' }} />
      <Stack.Screen name="[id]" options={{ title: 'Place' }} />
      <Stack.Screen name="post/[id]" options={{ title: 'Post' }} />
      <Stack.Screen name="compose" options={{ title: 'New post', presentation: 'modal' }} />
    </Stack>
  );
}
