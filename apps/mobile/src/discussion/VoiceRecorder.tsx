import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  type RecordingOptions,
} from 'expo-audio';
import { DARK, VOICE_MAX_SECONDS } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { clock } from '@/format';
import { Text } from '@/text';
import { postRawFile } from './photos';
import { VoicePlayer } from './VoicePlayer';
import { showAlert } from '@/dialog';
import { ensureGuide } from '@/guides/guide';

export interface UploadedVoice {
  id: string;
  url: string;
  durationMs: number;
}

/** D75: mono AAC in .m4a, 64 kbps: clear for speech, about 0.5 MB a minute. */
const VOICE_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  numberOfChannels: 1,
  bitRate: 64_000,
};

/**
 * Record a voice post (D75): tap the mic to start, tap stop (or it stops at 60 s). The
 * clip uploads straight away; you can listen to it or delete it before posting.
 */
export function VoiceRecorder({
  value,
  onChange,
  disabled,
}: {
  value: UploadedVoice | null;
  onChange: (v: UploadedVoice | null) => void;
  disabled?: boolean;
}) {
  const recorder = useAudioRecorder(VOICE_OPTIONS);
  const [state, setState] = useState<'idle' | 'recording' | 'uploading'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string>();
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearInterval(timer.current);
    },
    [],
  );

  async function start() {
    setError(undefined);
    if (!(await ensureGuide('voice'))) return; // D104
    const perm = await requestRecordingPermissionsAsync();
    if (!perm.granted) {
      showAlert(
        'Microphone needed',
        'Allow microphone access to record a voice post.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Open Settings', onPress: () => void Linking.openSettings() },
        ],
        { icon: 'mic-off-outline', tone: 'warning' },
      );
      return;
    }
    await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
    await recorder.prepareToRecordAsync();
    recorder.record({ forDuration: VOICE_MAX_SECONDS });
    setSeconds(0);
    setState('recording');
    timer.current = setInterval(() => {
      setSeconds(Math.floor(recorder.currentTime));
      // Stopped by the 60 s limit.
      if (!recorder.isRecording && recorder.currentTime > 0) void stop();
    }, 250);
  }

  async function stop() {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setState('uploading');
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false });
      if (!recorder.uri) throw new Error('no file');
      onChange(await postRawFile<UploadedVoice>('/api/v1/voice', recorder.uri, 'audio/mp4'));
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t save the recording.');
    } finally {
      setState('idle');
    }
  }

  if (value) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <VoicePlayer voice={value} />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Delete recording"
          onPress={() => onChange(null)}
          hitSlop={8}
          style={{ padding: 6 }}
        >
          <Ionicons name="trash-outline" size={22} color={DARK.text} />
        </Pressable>
      </View>
    );
  }

  const recording = state === 'recording';
  return (
    <View style={{ marginTop: 8 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={recording ? 'Stop recording' : 'Record a voice post'}
        onPress={() => void (recording ? stop() : start())}
        disabled={disabled || state === 'uploading'}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          minHeight: 52,
          paddingHorizontal: 14,
          borderRadius: 26,
          borderWidth: 1.5,
          borderColor: recording ? DARK.error : DARK.hairline,
          backgroundColor: recording ? DARK.errorSoft : DARK.raised,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {state === 'uploading' ? (
          <ActivityIndicator color={DARK.accent} />
        ) : (
          <Ionicons
            name={recording ? 'stop-circle' : 'mic'}
            size={26}
            color={recording ? DARK.error : DARK.accent}
          />
        )}
        <Text style={{ color: DARK.text, fontWeight: '600' }}>
          {recording
            ? `Recording ${clock(seconds)} / ${clock(VOICE_MAX_SECONDS)}: tap to stop`
            : state === 'uploading'
              ? 'Saving…'
              : `Record a voice post (up to ${VOICE_MAX_SECONDS} s)`}
        </Text>
      </Pressable>
      {error ? <Text style={{ color: DARK.error, marginTop: 4 }}>{error}</Text> : null}
    </View>
  );
}
