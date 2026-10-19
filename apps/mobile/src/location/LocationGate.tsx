import { Linking, ScrollView, View } from 'react-native';
import type { LocationPermissionResponse } from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK } from '@jax/shared';
import { useAuth } from '@/auth/AuthContext';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { Banner, Button, type IconName } from '@/ui';
import { Text } from '@/text';

const REASONS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'shield-checkmark',
    title: 'Confirm you’re in Duval County',
    body: 'Jax is a Jacksonville-only community.',
  },
  {
    icon: 'people',
    title: 'Show posts and places near you',
    body: 'Your feed is what’s happening within your radius.',
  },
  {
    icon: 'storefront',
    title: 'Keep place talk honest',
    body: 'Only people who are actually nearby can post about a place.',
  },
];

/**
 * Shown until foreground location permission is granted (P2.9, D16). The phone's own
 * prompt appears once, after this explanation; the OS remembers the answer. If the user
 * refused permanently, the button opens Settings instead.
 *
 * D78: the usual "permission primer": a clear icon, why it's needed in three short rows,
 * a privacy promise, then one button.
 */
export function LocationGate({
  permission,
  request,
}: {
  permission: LocationPermissionResponse | null;
  request: () => Promise<unknown>;
}) {
  const { signOut } = useAuth();
  const insets = useSafeAreaInsets();
  const blocked = permission?.status === 'denied' && !permission.canAskAgain;

  return (
    <ScrollView
      style={{ backgroundColor: DARK.page }}
      contentContainerStyle={{
        padding: SPACE.xl,
        paddingTop: insets.top + SPACE.xxl,
        paddingBottom: insets.bottom + SPACE.xl,
        gap: SPACE.lg,
      }}
    >
      <View style={{ alignItems: 'center', gap: SPACE.md }}>
        <View
          style={{
            width: 96,
            height: 96,
            borderRadius: 48,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: DARK.bar,
          }}
        >
          <Ionicons name="location-sharp" size={48} color={DARK.accent} />
        </View>
        <Text
          accessibilityRole="header"
          style={[TYPE.title, { color: DARK.text, textAlign: 'center' }]}
        >
          Jax needs your location
        </Text>
        <Text style={[TYPE.callout, { color: DARK.textMuted, textAlign: 'center' }]}>
          We use it only while you use the app, to:
        </Text>
      </View>

      <View style={{ gap: SPACE.md }}>
        {REASONS.map((r) => (
          <View key={r.title} style={{ flexDirection: 'row', gap: SPACE.md, alignItems: 'center' }}>
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: RADIUS.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: DARK.raised,
              }}
            >
              <Ionicons name={r.icon} size={22} color={DARK.accent} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[TYPE.label, { color: DARK.text }]}>{r.title}</Text>
              <Text style={[TYPE.caption, { color: DARK.textMuted }]}>{r.body}</Text>
            </View>
          </View>
        ))}
      </View>

      <Banner icon="eye-off-outline" style={{ marginBottom: 0 }}>
        <Text style={[TYPE.callout, { color: DARK.text }]}>
          Choose <Text style={{ fontWeight: '800' }}>&quot;While using the app&quot;</Text>. We
          never track you in the background, and other people never see your exact location.
        </Text>
      </Banner>

      {blocked ? (
        <View>
          <Text style={[TYPE.callout, { color: DARK.text }]}>
            Location is turned off for Jax. Turn it on in Settings → Location → &quot;While using
            the app&quot;.
          </Text>
          <Button
            title="Open Settings"
            icon="settings-outline"
            onPress={() => void Linking.openSettings()}
          />
        </View>
      ) : (
        <Button title="Allow location" icon="navigate" onPress={() => void request()} />
      )}
      <Text style={[TYPE.caption, { color: DARK.textMuted, textAlign: 'center' }]}>
        Without location you can still manage your account, but you won&apos;t see the feed or
        places.
      </Text>
      <Button variant="link" title="Sign out" onPress={signOut} />
    </ScrollView>
  );
}
