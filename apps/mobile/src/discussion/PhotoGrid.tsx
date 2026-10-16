import { Image, Pressable, View } from 'react-native';
import { COLORS, type PhotoView } from '@jax/shared';
import { photoUri } from './photos';

/**
 * Photos on a post (P6.4): the first one large, the rest as a row of thumbnails. Images
 * load through short-lived signed links; long-press one to report it (P6.5).
 */
export function PhotoGrid({
  photos,
  onLongPress,
}: {
  photos: PhotoView[];
  onLongPress?: (photo: PhotoView) => void;
}) {
  if (!photos.length) return null;
  const [first, ...rest] = photos;
  const ratio = Math.min(1.8, Math.max(0.6, first!.width / first!.height));
  const img = (p: PhotoView, style: object) => (
    <Pressable
      key={p.id}
      onLongPress={onLongPress ? () => onLongPress(p) : undefined}
      accessibilityLabel="Photo"
      accessibilityHint={onLongPress ? 'Long-press to report' : undefined}
    >
      <Image
        source={{ uri: photoUri(p.url) }}
        style={[{ borderRadius: 8, backgroundColor: COLORS.surfaceMuted }, style]}
        resizeMode="cover"
      />
    </Pressable>
  );
  return (
    <View style={{ marginTop: 10, gap: 6 }}>
      {img(first!, { width: '100%', aspectRatio: ratio })}
      {rest.length ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {rest.map((p) => img(p, { width: 72, height: 72 }))}
        </View>
      ) : null}
    </View>
  );
}
