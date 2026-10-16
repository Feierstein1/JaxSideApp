import { Image, Text, View } from 'react-native';
import { BRAND, COLORS } from '@jax/shared';
import { photoUri } from '@/discussion/photos';

/** Round profile picture (P6.5) with a gold ring (on the black header, D33); initial if none. */
export function ProfileAvatar({
  name,
  url,
  size = 72,
}: {
  name: string;
  url: string | null;
  size?: number;
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
        borderWidth: 3,
        borderColor: BRAND.gold,
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
