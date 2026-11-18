import { useEffect, useState } from 'react';
import { DarkTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import {
  PlusJakartaSans_400Regular,
  PlusJakartaSans_500Medium,
  PlusJakartaSans_600SemiBold,
  PlusJakartaSans_700Bold,
  PlusJakartaSans_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/plus-jakarta-sans';
import { JosefinSans_700Bold } from '@expo-google-fonts/josefin-sans/700Bold';
import { RussoOne_400Regular } from '@expo-google-fonts/russo-one';
import { DARK } from '@jax/shared';
import { AuthProvider, useAuth } from '@/auth/AuthContext';
import { VerifyEmailGate } from '@/auth/VerifyEmailGate';
import { DialogHost } from '@/dialog';
import { GuideHost } from '@/guides/guide';
import { LoadingEmblem } from '@/brand/Emblem';
import { MaintenanceGate } from '@/maintenance/MaintenanceGate';
import { BOOT_TIMEOUT_MS, resetBoot, retryBoot, useBoot } from '@/boot';
import { ErrorState } from '@/ui';

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
      {/* D121: the frame draws in, the skyline appears, the fins light up, the name fills. */}
      <LoadingEmblem />
    </View>
  );
}

function RootStack() {
  const { state } = useAuth();
  const { ready, attempt } = useBoot();
  const [timedOut, setTimedOut] = useState(false);
  const signedIn = state.status === 'signedIn' || state.status === 'guest';
  // D267: signed out, the next sign-in waits for its first screen again.
  useEffect(() => {
    if (state.status === 'signedOut') resetBoot();
  }, [state.status]);
  // D267: waiting too long for the first screen is an error, not an endless animation.
  const waiting = signedIn && !ready;
  useEffect(() => {
    setTimedOut(false);
    if (!waiting) return;
    const t = setTimeout(() => setTimedOut(true), BOOT_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [waiting, attempt]);
  if (state.status === 'loading') return <Loading />;
  return (
    <>
      {renderStack(signedIn, attempt)}
      {waiting ? (
        <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}>
          {timedOut ? (
            <View style={{ flex: 1, backgroundColor: DARK.page, justifyContent: 'center' }}>
              <ErrorState
                message="JaxSide is taking too long to load. Check your connection and try again."
                onRetry={retryBoot}
              />
            </View>
          ) : (
            <Loading />
          )}
        </View>
      ) : null}
    </>
  );
}

function renderStack(signedIn: boolean, attempt: number) {
  return (
    <Stack key={attempt} screenOptions={{ contentStyle: { backgroundColor: DARK.page } }}>
      {/* D137: expo-router 58 redirects a blocked route to the navigator's first open group,
          and (auth) has no index of its own, so a signed-out start landed on "/" (Unmatched
          Route). Send signed-out people to sign-in explicitly. */}
      <Stack.Protected guard={signedIn} redirectTo="/sign-in">
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
    JosefinSans_700Bold, // D127: art deco tabs and section titles
  });
  return (
    <ThemeProvider value={NAV_THEME}>
      <StatusBar style="light" />
      {/* If the fonts fail to load the app still opens, in the phone's own font. */}
      {fontsLoaded || fontError ? (
        <AuthProvider>
          <RootStack />
          {/* D159: in front of everything until the email is confirmed. */}
          <VerifyEmailGate />
          {/* D97: the app's styled pop-ups (showAlert / showMenu). */}
          <DialogHost />
          {/* D104: first-time guides. */}
          <GuideHost />
          {/* D246: in front of everything while the server is switched off. */}
          <MaintenanceGate />
        </AuthProvider>
      ) : (
        <View style={{ flex: 1, backgroundColor: DARK.bar }} />
      )}
    </ThemeProvider>
  );
}
