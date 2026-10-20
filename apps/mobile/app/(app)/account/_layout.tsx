import { Stack } from 'expo-router';
import { headerOptions } from '@/ui';

/**
 * D85: the tab's main screen is always underneath, so a screen opened from another tab
 * (e.g. a place from the Friends feed) has a back arrow and the tab returns to its list.
 */
export const unstable_settings = { initialRouteName: 'index' };

export default function AccountLayout() {
  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="index" options={{ title: 'Account' }} />
      <Stack.Screen name="username" options={{ title: 'Change username' }} />
      <Stack.Screen name="password" options={{ title: 'Change password' }} />
      <Stack.Screen name="email" options={{ title: 'Change email' }} />
      <Stack.Screen name="blocked" options={{ title: 'Blocked users' }} />
      <Stack.Screen name="reports" options={{ title: 'My reports' }} />
      <Stack.Screen name="suggestions" options={{ title: 'My suggestions' }} />
      <Stack.Screen name="standing" options={{ title: 'Account standing' }} />
      <Stack.Screen name="delete" options={{ title: 'Delete account' }} />
      <Stack.Screen name="legal/[key]" options={{ title: 'Policies' }} />
      <Stack.Screen name="contact" options={{ title: 'Contact us' }} />
      <Stack.Screen name="rules" options={{ title: 'Community rules' }} />
    </Stack>
  );
}
