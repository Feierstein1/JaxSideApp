import { ActivityIndicator, View } from 'react-native';
import { Tabs } from 'expo-router';
import * as Location from 'expo-location';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BRAND, COLORS } from '@jax/shared';
import { useGuest } from '@/auth/guest';
import { LocationGate } from '@/location/LocationGate';
import { headerOptions } from '@/ui';

/**
 * Signed-in area. Location-based screens need foreground permission (D16); until it's
 * granted, only the explanation/settings screen is shown. The OS remembers the answer,
 * so this asks once (unless the user picked "Only this time").
 */
export default function AppLayout() {
  const [permission, request] = Location.useForegroundPermissions();
  const { isGuest } = useGuest();

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
        name="(home)"
        options={{
          headerShown: false,
          title: 'Home',
          tabBarLabel: 'Home',
          tabBarIcon: ({ color, size }) => <Ionicons name="home" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="places"
        options={{
          headerShown: false,
          title: 'Places',
          // P4.2: business rooms are for registered users only.
          href: isGuest ? null : undefined,
          tabBarIcon: ({ color, size }) => <Ionicons name="storefront" color={color} size={size} />,
        }}
      />
      <Tabs.Screen
        name="friends"
        options={{
          headerShown: false,
          title: 'Friends',
          // D76: friends are for registered users.
          href: isGuest ? null : undefined,
          tabBarIcon: ({ color, size }) => <Ionicons name="people" color={color} size={size} />,
        }}
      />
      {/* D76: opened from the bell, not a tab. */}
      <Tabs.Screen name="notifications" options={{ href: null, title: 'Notifications' }} />
      <Tabs.Screen
        name="account"
        options={{
          headerShown: false,
          title: 'Account',
          tabBarIcon: ({ color, size }) => <Ionicons name="person" color={color} size={size} />,
        }}
      />
    </Tabs>
  );
}
