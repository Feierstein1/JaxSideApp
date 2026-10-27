import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { MEDAL } from '@jax/shared';
import { Text } from '@/text';

/**
 * D141: shown under a staff member's name (posts, comments, their profile), so people can
 * tell when an admin is speaking. Gold, unlike the teal used for everything else.
 */
export function AdminTag({ small = false }: { small?: boolean }) {
  return (
    <View
      accessible
      accessibilityLabel="JaxSide admin"
      style={{
        alignSelf: 'flex-start',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 3,
        paddingHorizontal: small ? 5 : 7,
        height: small ? 16 : 19,
        borderRadius: 4,
        backgroundColor: MEDAL.gold,
        marginTop: 2,
      }}
    >
      <Ionicons name="shield-checkmark" size={small ? 10 : 12} color={MEDAL.onGold} />
      <Text
        style={{
          color: MEDAL.onGold,
          fontSize: small ? 9.5 : 11,
          fontWeight: '800',
          letterSpacing: 0.8,
        }}
      >
        ADMIN
      </Text>
    </View>
  );
}
