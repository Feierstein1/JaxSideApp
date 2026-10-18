import type { ComponentProps } from 'react';
import { ActivityIndicator, View, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import * as Location from 'expo-location';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BRAND, COLORS } from '@jax/shared';
import { useGuest } from '@/auth/guest';
import { LocationGate } from '@/location/LocationGate';
import { haptic } from '@/motion';
import { headerOptions } from '@/ui';

type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * D78: tab icon. The active tab is filled and gold on a raised pill (the Material 3
 * "active indicator"); the others are white outlines.
 */
function tabIcon(name: string) {
  function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
    return (
      <View
        style={{
          width: 56,
          height: 30,
          borderRadius: 15,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: focused ? COLORS.surfaceDarkRaised : 'transparent',
        }}
      >
        <Ionicons name={(focused ? name : `${name}-outline`) as IconName} color={color} size={22} />
      </View>
    );
  }
  return TabIcon;
}

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
  if (!permission.granted) return <LocationGate permission={permission} request={request} />;

  return (
    <Tabs
      screenListeners={{ tabPress: () => haptic.select() }}
      screenOptions={{
        ...headerOptions,
        // Black tab bar with gold for the active tab (9.2:1) and white for the rest (D33).
        tabBarStyle: {
          backgroundColor: COLORS.surfaceInverse,
          borderTopColor: COLORS.surfaceDark,
        },
        tabBarActiveTintColor: BRAND.gold,
        tabBarInactiveTintColor: COLORS.onSurfaceInverse,
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700', marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="(home)"
        options={{
          headerShown: false,
          title: 'Home',
          tabBarLabel: 'Home',
          tabBarIcon: tabIcon('home'),
        }}
      />
      <Tabs.Screen
        name="places"
        options={{
          headerShown: false,
          title: 'Places',
          // P4.2: business rooms are for registered users only.
          href: isGuest ? null : undefined,
          tabBarIcon: tabIcon('storefront'),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          headerShown: false,
          title: 'Account',
          tabBarIcon: tabIcon('person-circle'),
        }}
      />
    </Tabs>
  );
}
