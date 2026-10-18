import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  type AudioPlayer,
} from 'expo-audio';
import { COLORS, type VoiceView } from '@jax/shared';
import { clock } from '@/format';
import { photoUri } from './photos';

/** Only one clip plays at a time across the app. */
let current: AudioPlayer | null = null;

/**
 * D75: play/pause a voice post with a progress bar and time. The clip loads on the first
 * tap (not when the feed scrolls by), through the post's signed link.
 */
export function VoicePlayer({ voice }: { voice: Pick<VoiceView, 'url' | 'durationMs'> }) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const total = status.duration > 0 ? status.duration : voice.durationMs / 1000;
  const progress = total > 0 ? Math.min(1, status.currentTime / total) : 0;

  useEffect(() => {
    if (status.didJustFinish) void player.seekTo(0);
  }, [status.didJustFinish, player]);

  async function toggle() {
    if (status.playing) {
      player.pause();
      return;
    }
    if (current && current !== player) current.pause();
    current = player;
    if (!status.isLoaded) {
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
      player.replace({ uri: photoUri(voice.url) });
    }
    player.play();
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 24,
        backgroundColor: COLORS.surfaceInverse,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause voice post' : 'Play voice post'}
        onPress={() => void toggle()}
        hitSlop={8}
        style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
      >
        <Ionicons
          name={status.playing ? 'pause' : 'play'}
          size={24}
          color={COLORS.onSurfaceInverse}
        />
      </Pressable>
      <View
        style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: COLORS.onSurfaceDarkMuted }}
      >
        <View
          style={{
            width: `${progress * 100}%`,
            height: 4,
            borderRadius: 2,
            backgroundColor: COLORS.accent,
          }}
        />
      </View>
      <Text style={{ color: COLORS.onSurfaceInverse, fontVariant: ['tabular-nums'] }}>
        {status.playing || status.currentTime > 0 ? clock(status.currentTime) : clock(total)}
      </Text>
    </View>
  );
}
