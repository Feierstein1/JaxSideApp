import { Image, Text, View } from 'react-native';
import { BRAND, COLORS } from '@jax/shared';
import { photoUri } from '@/discussion/photos';

/** Round profile picture (P6.5) with a gold ring (on the black header, D33); initial if none. */
export function ProfileAvatar({
  name,
  url,
  size = 72,
  ringColor = BRAND.gold,
}: {
  name: string;
  url: string | null;
  size?: number;
  ringColor?: string;
}) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: COLORS.primary,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: size < 48 ? 2 : 3,
        borderColor: ringColor,
        overflow: 'hidden',
      }}
    >
      {url ? (
        <Image
          source={{ uri: photoUri(url) }}
          style={{ width: size, height: size }}
          accessibilityLabel={`${name}'s profile photo`}
        />
      ) : (
        <Text style={{ color: COLORS.onPrimary, fontSize: size * 0.42, fontWeight: '700' }}>
          {name.charAt(0).toUpperCase()}
        </Text>
      )}
    </View>
  );
}
