import { Image, Pressable, View, type ImageStyle } from 'react-native';
import { DARK, type PhotoView } from '@jax/shared';
import { photoUri } from './photos';

/**
 * Photos on a post (P6.4, D78): one photo shows large at its own shape (within limits);
 * two sit side by side as squares; three or more show the first large and the rest as an
 * even row of squares. Images load through short-lived signed links; long-press one to
 * report it (P6.5).
 */
export function PhotoGrid({
  photos,
  onLongPress,
}: {
  photos: PhotoView[];
  onLongPress?: (photo: PhotoView) => void;
}) {
  if (!photos.length) return null;
  const img = (p: PhotoView, style: ImageStyle, flex = false) => (
    <Pressable
      key={p.id}
      style={flex ? { flex: 1 } : undefined}
      onLongPress={onLongPress ? () => onLongPress(p) : undefined}
      accessibilityLabel="Photo"
      accessibilityHint={onLongPress ? 'Long-press to report' : undefined}
    >
      <Image
        source={{ uri: photoUri(p.url) }}
        style={[{ borderRadius: 12, backgroundColor: DARK.raised }, style]}
        resizeMode="cover"
      />
    </Pressable>
  );
  const square: ImageStyle = { width: '100%', aspectRatio: 1 };

  if (photos.length === 2) {
    return (
      <View style={{ marginTop: 12, flexDirection: 'row', gap: 6 }}>
        {photos.map((p) => img(p, square, true))}
      </View>
    );
  }
  const [first, ...rest] = photos;
  const ratio = Math.min(1.8, Math.max(0.7, first!.width / first!.height));
  return (
    <View style={{ marginTop: 12, gap: 6 }}>
      {img(first!, { width: '100%', aspectRatio: ratio })}
      {rest.length ? (
        <View style={{ flexDirection: 'row', gap: 6 }}>
          {rest.map((p) => img(p, square, true))}
        </View>
      ) : null}
    </View>
  );
}
