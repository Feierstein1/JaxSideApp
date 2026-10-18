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
        paddingVertical: 6,
        paddingLeft: 6,
        paddingRight: 14,
        borderRadius: 26,
        backgroundColor: COLORS.surfaceInverse,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={status.playing ? 'Pause voice post' : 'Play voice post'}
        onPress={() => void toggle()}
        hitSlop={8}
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: COLORS.accent,
        }}
      >
        {/* D78: black icon on a gold circle (D33). */}
        <Ionicons
          name={status.playing ? 'pause' : 'play'}
          size={20}
          color={COLORS.onAccent}
          style={status.playing ? undefined : { marginLeft: 2 }}
        />
      </Pressable>
      <Ionicons name="mic" size={16} color={COLORS.onSurfaceDarkMuted} />
      <View
        style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: COLORS.surfaceDarkRaised }}
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
      <Text
        style={{ color: COLORS.onSurfaceInverse, fontWeight: '700', fontVariant: ['tabular-nums'] }}
      >
        {status.playing || status.currentTime > 0 ? clock(status.currentTime) : clock(total)}
      </Text>
    </View>
  );
}
