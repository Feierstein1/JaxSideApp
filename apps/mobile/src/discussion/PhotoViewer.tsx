import { useState } from 'react';
import {
  FlatList,
  Image,
  Modal,
  Pressable,
  StatusBar,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK, type PhotoView } from '@jax/shared';
import { Text } from '@/text';
import { photoUri } from './photos';

/**
 * D145: a post's photos full screen. Swipe left and right through them (starting at the
 * one tapped), "2 / 3" at the top, × or the back button closes. Photos are shown whole
 * (not cropped) on black.
 */
export function PhotoViewer({
  photos,
  start,
  onClose,
}: {
  photos: PhotoView[];
  /** The photo tapped, or null when the viewer is closed. */
  start: number | null;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(start ?? 0);
  const open = start !== null;

  return (
    <Modal
      visible={open}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
      onShow={() => setIndex(start ?? 0)}
    >
      <StatusBar barStyle="light-content" />
      <View style={{ flex: 1, backgroundColor: DARK.shadow }}>
        {open ? (
          <FlatList
            data={photos}
            keyExtractor={(p) => p.id}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            initialScrollIndex={start ?? 0}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => (
              <View style={{ width, height, justifyContent: 'center' }}>
                <Image
                  source={{ uri: photoUri(item.url) }}
                  style={{ width, height: height - insets.top - insets.bottom - 120 }}
                  resizeMode="contain"
                  accessibilityLabel="Photo"
                />
              </View>
            )}
          />
        ) : null}
        <View
          style={{
            position: 'absolute',
            top: insets.top + 8,
            left: 0,
            right: 0,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 12,
          }}
        >
          <Text
            accessibilityLiveRegion="polite"
            style={{ color: DARK.text, fontWeight: '800', fontSize: 16, marginLeft: 6 }}
          >
            {photos.length > 1 ? `${index + 1} / ${photos.length}` : ''}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close photos"
            onPress={onClose}
            hitSlop={10}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: DARK.raised,
            }}
          >
            <Ionicons name="close" size={26} color={DARK.text} />
          </Pressable>
        </View>
        {photos.length > 1 ? (
          // Dots under the photo show where you are.
          <View
            style={{
              position: 'absolute',
              bottom: insets.bottom + 28,
              left: 0,
              right: 0,
              flexDirection: 'row',
              justifyContent: 'center',
              gap: 8,
            }}
          >
            {photos.map((p, i) => (
              <View
                key={p.id}
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 4,
                  backgroundColor: i === index ? DARK.accent : DARK.border,
                }}
              />
            ))}
          </View>
        ) : null}
      </View>
    </Modal>
  );
}
