import { ActivityIndicator, View, type ColorValue } from 'react-native';
import { Tabs } from 'expo-router';
import * as Location from 'expo-location';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK } from '@jax/shared';
import { useGuest } from '@/auth/guest';
import { LocationGate } from '@/location/LocationGate';
import { haptic } from '@/motion';
import { FONT } from '@/text';
import { type IconName } from '@/ui';

/**
 * D78 / D79: tab icon. The active tab is filled and gold on a raised pill (the Material 3
 * "active indicator"); the others are grey outlines.
 */
function tabIcon(name: string) {
  function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
    return (
      <View
        style={{
          width: 60,
          height: 32,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: focused ? DARK.raised : 'transparent',
        }}
      >
        <Ionicons name={(focused ? name : `${name}-outline`) as IconName} color={color} size={23} />
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
          backgroundColor: DARK.page,
        }}
      >
        <ActivityIndicator color={DARK.accent} />
      </View>
    );
  }
  if (!permission.granted) return <LocationGate permission={permission} request={request} />;

  return (
    <Tabs
      screenListeners={{ tabPress: () => haptic.select() }}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: DARK.page },
        // Black tab bar: gold for the active tab (9.2:1), grey for the rest (D33).
        tabBarStyle: {
          backgroundColor: DARK.bar,
          borderTopColor: DARK.hairline,
          paddingTop: 6,
        },
        tabBarActiveTintColor: DARK.accent,
        tabBarInactiveTintColor: DARK.textMuted,
        tabBarLabelStyle: { fontSize: 11.5, fontFamily: FONT.bold, marginTop: 2 },
      }}
    >
      <Tabs.Screen name="(home)" options={{ title: 'Home', tabBarIcon: tabIcon('home') }} />
      <Tabs.Screen
        name="places"
        options={{
          title: 'Places',
          // P4.2: business rooms are for registered users only.
          href: isGuest ? null : undefined,
          tabBarIcon: tabIcon('storefront'),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: 'Account', tabBarIcon: tabIcon('person-circle') }}
      />
    </Tabs>
  );
}
