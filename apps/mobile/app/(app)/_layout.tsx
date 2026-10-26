import { useEffect } from 'react';
import { ActivityIndicator, Pressable, View, type ColorValue } from 'react-native';
import { router, Tabs } from 'expo-router';
import * as Location from 'expo-location';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK } from '@jax/shared';
import { useGuest } from '@/auth/guest';
import { ensureGuide } from '@/guides/guide';
import { LocationGate } from '@/location/LocationGate';
import { haptic } from '@/motion';
import { FONT } from '@/text';
import { headerOptions, type IconName } from '@/ui';

/**
 * D78 / D79: tab icon. The active tab is filled and gold on a raised pill (the Material 3
 * "active indicator"); the others are grey outlines.
 */
function tabIcon(name: string) {
  function TabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
    return (
      <View
        // D130: a little smaller so five tabs fit (Citywide joined in the middle).
        style={{
          width: 52,
          height: 30,
          borderRadius: 15,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: focused ? DARK.raised : 'transparent',
        }}
      >
        <Ionicons
          name={(focused ? name : `${name}-outline`) as IconName}
          color={color as string}
          size={21}
        />
      </View>
    );
  }
  return TabIcon;
}

/**
 * Screens opened from the top bar (Messages, the bell), not from a tab. They stay declared as
 * tabs but with no tab button: expo-router redirects away from `href: null` tabs to the first
 * tab, which sent these to Home.
 */
const noTabButton = { tabBarButton: () => null, tabBarItemStyle: { display: 'none' as const } };

/**
 * Signed-in area. Location-based screens need foreground permission (D16); until it's
 * granted, only the explanation/settings screen is shown. The OS remembers the answer,
 * so this asks once (unless the user picked "Only this time").
 */
export default function AppLayout() {
  const [permission, request] = Location.useForegroundPermissions();
  const { isGuest } = useGuest();
  const granted = !!permission?.granted;
  // D104: once, the first time a guest gets in.
  useEffect(() => {
    if (isGuest && granted) void ensureGuide('guestWelcome');
  }, [isGuest, granted]);

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
        tabBarLabelStyle: { fontSize: 10.5, fontFamily: FONT.bold, marginTop: 2 },
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
        // D89: tapping Places always shows the Places list, even if a place was opened in
        // this tab from somewhere else (e.g. a friend's "posted at …").
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('places', { screen: 'index' });
          },
        })}
      />
      {/* D130: Citywide in the middle: topics for all of Duval that everyone can join
          (guests can read them too). Tapping it always shows the topic list. */}
      <Tabs.Screen
        name="citywide"
        options={{ title: 'Topics', tabBarIcon: tabIcon('globe') }}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation.navigate('citywide', { screen: 'index' });
          },
        })}
      />
      <Tabs.Screen
        name="friends"
        options={{
          headerShown: false,
          title: 'Friends',
          // D76: friends are for registered users.
          href: isGuest ? null : undefined,
          tabBarIcon: tabIcon('people'),
        }}
      />
      {/* D98: opened from the Messages button, not a tab. */}
      <Tabs.Screen
        name="messages"
        options={{ ...noTabButton, headerShown: false, title: 'Messages' }}
      />
      {/* D76: opened from the bell, not a tab. */}
      <Tabs.Screen
        name="notifications"
        options={{
          ...noTabButton,
          title: 'Notifications',
          // D79: a hidden tab has no stack, so it gets the app header and its own back arrow.
          ...headerOptions,
          headerShown: true,
          headerLeft: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              onPress={() => router.back()}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="arrow-back" size={24} color={DARK.accent} />
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{ title: 'Account', tabBarIcon: tabIcon('person-circle') }}
      />
    </Tabs>
  );
}
