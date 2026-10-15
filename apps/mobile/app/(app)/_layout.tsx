import { ActivityIndicator, View } from 'react-native';
import { Tabs } from 'expo-router';
import * as Location from 'expo-location';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BRAND, COLORS } from '@jax/shared';
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
    <Tabs
      screenOptions={{
        ...headerOptions,
        // Black tab bar with gold for the active tab (9.2:1) and white for the rest (D33).
        tabBarStyle: { backgroundColor: COLORS.surfaceInverse },
        tabBarActiveTintColor: BRAND.gold,
        tabBarInactiveTintColor: COLORS.onSurfaceInverse,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Jax',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="places"
        options={{
          headerShown: false,
          title: 'Places',
          tabBarIcon: ({ color, size }) => <Ionicons name="storefront" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
