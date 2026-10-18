import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { BRAND, COLORS } from '@jax/shared';
import { AuthProvider, useAuth } from '@/auth/AuthContext';

function RootStack() {
  const { state } = useAuth();
  if (state.status === 'loading') {
    // D78: black, like the splash and the header, so start-up doesn't flash white.
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: COLORS.surfaceInverse,
        }}
      >
        <ActivityIndicator color={BRAND.gold} />
      </View>
    );
  }
  const signedIn = state.status === 'signedIn' || state.status === 'guest';
  return (
    <Stack screenOptions={{ headerTitleAlign: 'center' }}>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <AuthProvider>
      <StatusBar style="light" />
      <RootStack />
    </AuthProvider>
  );
}
