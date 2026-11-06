import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useVideoPlayer, VideoView } from 'expo-video';
import { DARK, type VideoView as VideoInfo } from '@jax/shared';
import { clock } from '@/format';
import { Text } from '@/text';
import { RADIUS } from '@/tokens';
import { claimMedia } from './media-focus';
import { photoUri } from './photos';

/**
 * D102: a video in a post. Shows a play tile first (nothing loads while you scroll); tap
 * to load and play it with the phone's own controls.
 */
export function VideoPlayer({
  video,
  localUri,
  mediaKey = 'video',
}: {
  /** D203: the post it belongs to, so scrolling past or opening the post resets it. */
  mediaKey?: string;
  video: Pick<VideoInfo, 'url' | 'durationMs' | 'width' | 'height'>;
  /** Composer preview: the file on the phone instead of the server link. */
  localUri?: string;
}) {
  const [started, setStarted] = useState(false);
  // D203: while playing it holds the "now playing" claim; losing it puts the play tile back.
  useEffect(() => {
    if (!started) return;
    return claimMedia(mediaKey, () => setStarted(false));
  }, [started, mediaKey]);
  const ratio = video.width && video.height ? video.width / video.height : 16 / 9;
  // Very tall phone videos get a box a bit taller than wide (they're letterboxed inside).
  const box = {
    width: '100%' as const,
    aspectRatio: Math.min(2, Math.max(0.75, ratio)),
    borderRadius: RADIUS.md,
  };
  if (!started) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Play video, ${clock(video.durationMs / 1000)}`}
        onPress={() => setStarted(true)}
        style={[box, { backgroundColor: DARK.bar, alignItems: 'center', justifyContent: 'center' }]}
      >
        <View
          style={{
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: DARK.accent,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="play" size={28} color={DARK.onAccent} style={{ marginLeft: 3 }} />
        </View>
        <Text
          style={{
            position: 'absolute',
            right: 10,
            bottom: 8,
            color: DARK.text,
            fontWeight: '700',
            fontVariant: ['tabular-nums'],
          }}
        >
          {clock(video.durationMs / 1000)}
        </Text>
      </Pressable>
    );
  }
  return <Playing uri={localUri ?? photoUri(video.url)} style={box} />;
}

/**
 * D182: our own play, pause and replay (tap the video), not the phone's built-in controls.
 * Inside a post card those controls could stop answering taps, so a playing video couldn't be
 * paused or replayed until the app was restarted. A tap here always works: it pauses while
 * playing, resumes when paused, and restarts when the video has ended.
 */
function Playing({ uri, style }: { uri: string; style: object }) {
  const player = useVideoPlayer(uri, (p) => {
    p.loop = false;
    p.play();
  });
  const [playing, setPlaying] = useState(true);
  const [ended, setEnded] = useState(false);

  useEffect(() => {
    const change = player.addListener('playingChange', (e) => {
      setPlaying(e.isPlaying);
      if (e.isPlaying) setEnded(false);
    });
    const end = player.addListener('playToEnd', () => {
      setEnded(true);
      setPlaying(false);
    });
    return () => {
      change.remove();
      end.remove();
    };
  }, [player]);

  function toggle() {
    if (ended) {
      setEnded(false);
      player.replay();
    } else if (playing) {
      player.pause();
    } else {
      player.play();
    }
  }

  return (
    <View style={[style, { overflow: 'hidden', backgroundColor: DARK.bar }]}>
      <VideoView
        player={player}
        style={{ flex: 1 }}
        nativeControls={false}
        contentFit="contain"
        pointerEvents="none"
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={ended ? 'Replay video' : playing ? 'Pause video' : 'Play video'}
        onPress={toggle}
        style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
      >
        {!playing ? (
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: DARK.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons
              name={ended ? 'refresh' : 'play'}
              size={28}
              color={DARK.onAccent}
              style={ended ? undefined : { marginLeft: 3 }}
            />
          </View>
        ) : null}
      </Pressable>
    </View>
  );
}
