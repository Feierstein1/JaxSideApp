import { Stack } from 'expo-router';
import { headerOptions } from '@/ui';

export default function AuthLayout() {
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="sign-in" options={{ title: 'Sign in' }} />
      <Stack.Screen name="register" options={{ title: 'Create account' }} />
      <Stack.Screen name="forgot-password" options={{ title: 'Reset password' }} />
      <Stack.Screen name="legal/[key]" options={{ title: 'Policies' }} />
      <Stack.Screen name="appeal" options={{ title: 'Account standing' }} />
    </Stack>
  );
}
