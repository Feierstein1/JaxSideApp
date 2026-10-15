import { Linking, ScrollView, Text, View } from 'react-native';
import type { LocationPermissionResponse } from 'expo-location';
import { useAuth } from '@/auth/AuthContext';
import { Button, styles } from '@/ui';

/**
 * Shown until foreground location permission is granted (P2.9, D16). The phone's own
 * prompt appears once, after this explanation; the OS remembers the answer. If the user
 * refused permanently, the button opens Settings instead.
 */
export function LocationGate({
  permission,
  request,
}: {
  permission: LocationPermissionResponse | null;
  request: () => Promise<unknown>;
}) {
  const { signOut } = useAuth();
  const blocked = permission?.status === 'denied' && !permission.canAskAgain;

  return (
    <ScrollView contentContainerStyle={[styles.screen, { paddingTop: 48 }]}>
      <Text style={styles.title}>Jax needs your location</Text>
      <View style={styles.banner}>
        <Text style={styles.body}>
          Jax is a Jacksonville-only community. We use your location while you use the app to:
          {'\n'}• confirm you&apos;re in Duval County
          {'\n'}• show posts and places near you
          {'\n'}• make sure people posting about a place are actually nearby
        </Text>
      </View>
      <Text style={[styles.body, { marginBottom: 12 }]}>
        Choose <Text style={{ fontWeight: '700' }}>&quot;While using the app&quot;</Text>. We never
        track you in the background, and other people never see your exact location.
      </Text>
      {blocked ? (
        <>
          <Text style={[styles.body, { marginBottom: 8 }]}>
            Location is turned off for Jax. Turn it on in Settings → Location → &quot;While using
            the app&quot;.
          </Text>
          <Button title="Open Settings" onPress={() => void Linking.openSettings()} />
        </>
      ) : (
        <Button title="Allow location" onPress={() => void request()} />
      )}
      <Text style={[styles.body, styles.muted, { marginTop: 16 }]}>
        Without location you can still manage your account, but you won&apos;t see the feed or
        places.
      </Text>
      <Button variant="link" title="Sign out" onPress={signOut} />
    </ScrollView>
  );
}
