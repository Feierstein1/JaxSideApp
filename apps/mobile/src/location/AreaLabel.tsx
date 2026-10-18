import { Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BRAND, COLORS } from '@jax/shared';

/**
 * D72 / D78: the header title on Home and Places, with "Near Avondale" under it. The server
 * picks the closest named neighborhood to your verified location; the second line is left
 * out when none is close. `brand` shows the app name with a gold pin (Home).
 */
export function AreaTitle({
  title,
  area,
  brand = false,
}: {
  title: string;
  area: string | null | undefined;
  brand?: boolean;
}) {
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={area ? `${title}. You're near ${area}` : title}
      style={{ alignItems: 'center', maxWidth: 220 }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
        {brand ? <Ionicons name="location-sharp" size={19} color={BRAND.gold} /> : null}
        <Text
          style={{
            color: COLORS.onSurfaceInverse,
            fontSize: brand ? 22 : 17,
            fontWeight: brand ? '900' : '800',
            letterSpacing: brand ? -0.5 : 0,
          }}
        >
          {title}
        </Text>
      </View>
      {area ? (
        <Text
          numberOfLines={1}
          style={{ color: COLORS.onSurfaceDarkMuted, fontSize: 12, fontWeight: '600' }}
        >
          Near {area}
        </Text>
      ) : null}
    </View>
  );
}
