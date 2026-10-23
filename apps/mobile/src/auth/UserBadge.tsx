import { View } from 'react-native';
import { DARK } from '@jax/shared';
import { useAuth } from './AuthContext';
import { Text } from '@/text';

/**
 * The GUEST pill at the right of the top bar while browsing as a guest. D119: signed-in
 * people see nothing here; the username left the top bar (it's on the Account tab).
 */
export function UserBadge() {
  const { state } = useAuth();
  if (state.status !== 'guest') return null;
  return (
    <View
      style={{
        backgroundColor: DARK.accent,
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 4,
        marginRight: 4,
      }}
    >
      {/* Dark text on the accent (D33). */}
      <Text style={{ color: DARK.onAccent, fontWeight: '800', fontSize: 12 }}>GUEST</Text>
    </View>
  );
}
