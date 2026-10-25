import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { CONFIG_DEFAULTS, DARK, yardsLabel } from '@jax/shared';
import { router } from 'expo-router';
import { useAuth } from '@/auth/AuthContext';
import { Text } from '@/text';

/**
 * D72 / D79: "Near Avondale · within 528 yd" at the top of the black bar on Home and
 * Places: where you are (the server's closest named neighborhood) and how far the list
 * reaches. Tapping it opens Account, where the radius is set. The neighborhood part is
 * left out when none is close.
 */
export function AreaStrip({ area, label }: { area: string | null | undefined; label: string }) {
  const { state } = useAuth();
  const miles =
    state.status === 'signedIn'
      ? Math.min(
          state.user.radiusMiles ?? CONFIG_DEFAULTS['radius.general.defaultMiles'],
          CONFIG_DEFAULTS['radius.general.maxMiles'],
        )
      : CONFIG_DEFAULTS['radius.general.defaultMiles'];
  const radius = yardsLabel(miles);
  const signedIn = state.status === 'signedIn';
  return (
    <Pressable
      accessibilityRole={signedIn ? 'button' : 'text'}
      accessibilityLabel={`${label}${area ? ` near ${area}` : ''}, within ${radius}.${signedIn ? ' Change radius.' : ''}`}
      onPress={signedIn ? () => router.push('/account') : undefined}
      disabled={!signedIn}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 }}
    >
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          backgroundColor: DARK.accentSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="navigate" size={13} color={DARK.accent} />
      </View>
      <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 15 }}>
        <Text style={{ fontWeight: '800' }}>{area ? `Near ${area}` : label}</Text>
        <Text style={{ color: DARK.textMuted, fontWeight: '500' }}>{`  ·  within ${radius}`}</Text>
      </Text>
      {signedIn ? <Ionicons name="chevron-forward" size={14} color={DARK.textMuted} /> : null}
    </Pressable>
  );
}
