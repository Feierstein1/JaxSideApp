import { useState } from 'react';
import { Image, Pressable, View, type ImageStyle } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK, type PhotoView } from '@jax/shared';
import { Text } from '@/text';
import { PhotoViewer } from './PhotoViewer';
import { photoUri } from './photos';

/**
 * Photos on a post (P6.4, D78): one photo shows large at its own shape (within limits);
 * two sit side by side as squares; three or more show the first large and the rest as an
 * even row of squares. Images load through short-lived signed links; long-press one to
 * report it (P6.5). D145: tap one to see them all full screen; with two or more, the count
 * sits above the photos.
 */
export function PhotoGrid({
  photos,
  onLongPress,
}: {
  photos: PhotoView[];
  onLongPress?: (photo: PhotoView) => void;
}) {
  const [viewing, setViewing] = useState<number | null>(null);
  if (!photos.length) return null;
  const img = (p: PhotoView, style: ImageStyle, flex = false) => (
    <Pressable
      key={p.id}
      style={flex ? { flex: 1 } : undefined}
      onPress={() => setViewing(photos.indexOf(p))}
      onLongPress={onLongPress ? () => onLongPress(p) : undefined}
      accessibilityRole="imagebutton"
      accessibilityLabel={`Photo ${photos.indexOf(p) + 1} of ${photos.length}`}
      accessibilityHint={`Opens the photos full screen${onLongPress ? '; long-press to report' : ''}`}
    >
      <Image
        source={{ uri: photoUri(p.url) }}
        style={[{ borderRadius: 12, backgroundColor: DARK.raised }, style]}
        resizeMode="cover"
      />
    </Pressable>
  );
  const square: ImageStyle = { width: '100%', aspectRatio: 1 };
  const viewer = <PhotoViewer photos={photos} start={viewing} onClose={() => setViewing(null)} />;
  const count =
    photos.length > 1 ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 }}>
        <Ionicons name="images" size={14} color={DARK.textMuted} />
        <Text style={{ color: DARK.textMuted, fontSize: 12.5, fontWeight: '700' }}>
          {photos.length} photos · tap to view
        </Text>
      </View>
    ) : null;

  if (photos.length === 2) {
    return (
      <>
        {count}
        <View style={{ marginTop: 8, flexDirection: 'row', gap: 6 }}>
          {photos.map((p) => img(p, square, true))}
        </View>
        {viewer}
      </>
    );
  }
  const [first, ...rest] = photos;
  const ratio = Math.min(1.8, Math.max(0.7, first!.width / first!.height));
  return (
    <>
      {count}
      <View style={{ marginTop: count ? 8 : 12, gap: 6 }}>
        {img(first!, { width: '100%', aspectRatio: ratio })}
        {rest.length ? (
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {rest.map((p) => img(p, square, true))}
          </View>
        ) : null}
      </View>
      {viewer}
    </>
  );
}
