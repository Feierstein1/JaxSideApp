import { Stack } from 'expo-router';
import { headerOptions } from '@/ui';

export default function FriendsLayout() {
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="index" options={{ title: 'Friends' }} />
      <Stack.Screen name="manage" options={{ title: 'Your friends' }} />
    </Stack>
  );
}
