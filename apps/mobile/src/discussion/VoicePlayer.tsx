import { useCallback, useEffect, useRef } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  type AudioPlayer,
} from 'expo-audio';
import { DARK, type VoiceView } from '@jax/shared';
import { clock } from '@/format';
import { Text } from '@/text';
import { claimMedia } from './media-focus';
import { photoUri } from './photos';

/**
 * D84: pausing another clip must never crash. Its player may already be released (its post
 * scrolled away or a recording was deleted); the native call then rejects asynchronously.
 */
function pauseQuietly(p: AudioPlayer) {
  try {
    const r = p.pause() as unknown;
    if (r instanceof Promise) r.catch(() => undefined);
  } catch {
    // already released
  }
}

/**
 * D75: play/pause a voice post with a progress bar and time. The clip loads on the first
 * tap (not when the feed scrolls by), through the post's signed link.
 */
export function VoicePlayer({
  voice,
  mediaKey = 'voice',
}: {
  voice: Pick<VoiceView, 'url' | 'durationMs'>;
  /** D203: the post it belongs to, so scrolling past or opening the post stops it. */
  mediaKey?: string;
}) {
  const player = useAudioPlayer(null);
  const status = useAudioPlayerStatus(player);
  const total = status.duration > 0 ? status.duration : voice.durationMs / 1000;
  const progress = total > 0 ? Math.min(1, status.currentTime / total) : 0;

  // D86: a clip plays once. At the end it stops and rewinds, and waits for another tap
  // (rewinding a player that still counts as "playing" would start it again on Android).
  useEffect(() => {
    player.loop = false;
  }, [player]);
  useEffect(() => {
    if (!status.didJustFinish) return;
    pauseQuietly(player);
    void player.seekTo(0).catch(() => undefined);
  }, [status.didJustFinish, player]);

  // D84 / D203: only one clip or video plays at a time. Stopping rewinds this one; the claim is
  // dropped when the player goes away, so nothing tries to pause a released one.
  const release = useRef<(() => void) | null>(null);
  const stop = useCallback(() => {
    pauseQuietly(player);
    void player.seekTo(0).catch(() => undefined);
  }, [player]);
  useEffect(() => () => release.current?.(), []);

  async function toggle() {
    if (status.playing) {
      player.pause();
      return;
    }
    release.current?.();
    release.current = claimMedia(mediaKey, stop);
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
        backgroundColor: DARK.raised,
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
          backgroundColor: DARK.accent,
        }}
      >
        {/* D78: black icon on a gold circle (D33). */}
        <Ionicons
          name={status.playing ? 'pause' : 'play'}
          size={20}
          color={DARK.onAccent}
          style={status.playing ? undefined : { marginLeft: 2 }}
        />
      </Pressable>
      <Ionicons name="mic" size={16} color={DARK.textMuted} />
      <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: DARK.hairline }}>
        <View
          style={{
            width: `${progress * 100}%`,
            height: 4,
            borderRadius: 2,
            backgroundColor: DARK.accent,
          }}
        />
      </View>
      <Text style={{ color: DARK.text, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
        {status.playing || status.currentTime > 0 ? clock(status.currentTime) : clock(total)}
      </Text>
    </View>
  );
}
