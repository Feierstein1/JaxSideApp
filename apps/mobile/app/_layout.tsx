import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { RussoOne_400Regular } from '@expo-google-fonts/russo-one';
import { DARK } from '@jax/shared';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { installRemoteLogging } from '@/debug/remote-log';
import { DialogHost } from '@/dialog';
import { GuideHost } from '@/guides/guide';

// D100 (temporary): send app errors to the development server's log.
installRemoteLogging();
import { BrandMark } from '@/ui';

/** D79: navigation colors match the dark theme, so no white flashes between screens. */
const NAV_THEME = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: DARK.accent,
    background: DARK.page,
    card: DARK.bar,
    text: DARK.text,
    border: DARK.bar,
    notification: DARK.accent,
  },
};

function Loading() {
  return (
    <View
      style={{
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 24,
        backgroundColor: DARK.bar,
      }}
    >
      <BrandMark size="lg" />
      <ActivityIndicator color={DARK.accent} />
    </View>
  );
}

function RootStack() {
  const { state } = useAuth();
  if (state.status === 'loading') return <Loading />;
  const signedIn = state.status === 'signedIn' || state.status === 'guest';
  return (
    <Stack screenOptions={{ contentStyle: { backgroundColor: DARK.page } }}>
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
  // D79: the app typeface (see src/text.tsx).
  const [fontsLoaded, fontError] = useFonts({
    PlusJakartaSans_400Regular,
    PlusJakartaSans_500Medium,
    PlusJakartaSans_600SemiBold,
    PlusJakartaSans_700Bold,
    PlusJakartaSans_800ExtraBold,
    RussoOne_400Regular, // D120: the JaxSide name
  });
  return (
    <ThemeProvider value={NAV_THEME}>
      <StatusBar style="light" />
      {/* If the fonts fail to load the app still opens, in the phone's own font. */}
      {fontsLoaded || fontError ? (
        <AuthProvider>
          <RootStack />
          {/* D97: the app's styled pop-ups (showAlert / showMenu). */}
          <DialogHost />
          {/* D104: first-time guides. */}
          <GuideHost />
        </AuthProvider>
      ) : (
        <View style={{ flex: 1, backgroundColor: DARK.bar }} />
      )}
    </ThemeProvider>
  );
}
