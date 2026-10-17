import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BRAND, COLORS } from '@jax/shared';

/**
 * D72: "Near Avondale" at the top of the black bar on Home and Places. The server picks the
 * closest named neighborhood to your verified location; nothing shows when none is close.
 */
export function AreaLabel({ name }: { name: string | null | undefined }) {
  if (!name) return null;
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`You're near ${name}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
    >
      <Ionicons name="location" size={16} color={BRAND.gold} />
      <Text
        numberOfLines={1}
        style={{ color: COLORS.onSurfaceInverse, fontSize: 15, fontWeight: '700', flexShrink: 1 }}
      >
        Near {name}
      </Text>
    </View>
  );
}
