import { Stack } from 'expo-router';
import { headerOptions } from '@/ui';

export default function AppLayout() {
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="index" options={{ title: 'Jax' }} />
    </Stack>
  );
}
