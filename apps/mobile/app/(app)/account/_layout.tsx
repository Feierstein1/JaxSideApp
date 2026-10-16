import { Stack } from 'expo-router';
import { headerOptions } from '@/ui';

export default function AccountLayout() {
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="index" options={{ title: 'Account' }} />
      <Stack.Screen name="username" options={{ title: 'Change username' }} />
      <Stack.Screen name="password" options={{ title: 'Change password' }} />
      <Stack.Screen name="email" options={{ title: 'Change email' }} />
      <Stack.Screen name="blocked" options={{ title: 'Blocked users' }} />
      <Stack.Screen name="reports" options={{ title: 'My reports' }} />
      <Stack.Screen name="delete" options={{ title: 'Delete account' }} />
      <Stack.Screen name="legal/[key]" options={{ title: 'Policies' }} />
    </Stack>
  );
}
