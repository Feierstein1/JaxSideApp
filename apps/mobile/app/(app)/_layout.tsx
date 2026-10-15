import { ActivityIndicator, View } from 'react-native';
import { Stack } from 'expo-router';
import * as Location from 'expo-location';
import { COLORS } from '@jax/shared';
import { LocationGate } from '@/location/LocationGate';
import { headerOptions } from '@/ui';

/**
 * Signed-in area. Location-based screens need foreground permission (D16); until it's
 * granted, only the explanation/settings screen is shown. The OS remembers the answer,
 * so this asks once (unless the user picked "Only this time").
 */
export default function AppLayout() {
  const [permission, request] = Location.useForegroundPermissions();

  if (!permission) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={COLORS.primary} />
      </View>
    );
  }
  if (!permission.granted) return <LocationGate permission={permission} request={request} />;

  return (
    <Stack screenOptions={headerOptions}>
      <Stack.Screen name="index" options={{ title: 'Jax' }} />
    </Stack>
  );
}
