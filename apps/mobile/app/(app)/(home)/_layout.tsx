import { Stack } from 'expo-router';
import { headerOptions } from '@/ui';

export default function HomeLayout() {
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="index" options={{ title: 'Jax' }} />
      <Stack.Screen name="post/[id]" options={{ title: 'Post' }} />
      <Stack.Screen name="user/[username]" options={{ title: 'Profile' }} />
      <Stack.Screen name="compose" options={{ title: 'New post', presentation: 'modal' }} />
    </Stack>
  );
}
