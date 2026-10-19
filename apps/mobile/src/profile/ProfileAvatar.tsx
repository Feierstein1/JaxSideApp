import { Image, View } from 'react-native';
import { DARK, textOn } from '@jax/shared';
import { photoUri } from '@/discussion/photos';
import { Text } from '@/text';

/**
 * Round profile picture (P6.5). D79: a ring (usually the person's account color) with a
 * thin dark gap inside it, so the ring reads on the dark cards; the initial on `fill`
 * (their color, or raised grey) when there's no photo.
 */
export function ProfileAvatar({
  name,
  url,
  size = 72,
  ringColor = DARK.accent,
  fill = DARK.raised,
}: {
  name: string;
  url: string | null;
  size?: number;
  ringColor?: string;
  fill?: string;
}) {
  const ring = size < 48 ? 2 : 3;
  const gap = size < 48 ? 2 : 3;
  const inner = size - 2 * (ring + gap);
  const initialColor = fill.startsWith('#') && fill.length === 7 ? textOn(fill) : DARK.text;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth: ring,
        borderColor: ringColor,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: inner,
          height: inner,
          borderRadius: inner / 2,
          backgroundColor: fill,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        {url ? (
          <Image
            source={{ uri: photoUri(url) }}
            style={{ width: inner, height: inner }}
            accessibilityLabel={`${name}'s profile photo`}
          />
        ) : (
          <Text style={{ color: initialColor, fontSize: inner * 0.44, fontWeight: '800' }}>
            {name.charAt(0).toUpperCase()}
          </Text>
        )}
      </View>
    </View>
  );
}
