import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { COLORS, POST_MAX } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { Button, styles } from '@/ui';
import { createPost, markFeedsDirty } from './api';
import { sendScreened } from './screening';

/**
 * Write a post (P3.11). Area posts are placed at the author's (rounded) location by the
 * server; room posts go to the given place. The server checks location and limits.
 */
export function Compose({
  target,
  placeName,
}: {
  target: { kind: 'general' } | { kind: 'business'; placeId: string };
  placeName?: string;
}) {
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function submit() {
    if (!body.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      const sent = await sendScreened((ok) => createPost(target, body.trim(), ok));
      if (!sent) return; // chose to edit after a warning
      markFeedsDirty();
      router.back();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t get your location.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <Text style={[styles.body, styles.muted]}>
          {target.kind === 'general'
            ? 'Posting to your area. People within about a mile will see it. Your exact location is never shown.'
            : `Posting in ${placeName ?? 'this place'}’s discussion.`}
        </Text>
        <TextInput
          accessibilityLabel="Post text"
          placeholder={
            target.kind === 'general'
              ? 'What’s happening around here?'
              : 'Share something about this place…'
          }
          placeholderTextColor={COLORS.placeholder}
          value={body}
          onChangeText={setBody}
          maxLength={POST_MAX}
          multiline
          autoFocus
          textAlignVertical="top"
          style={[styles.input, { minHeight: 160, marginTop: 12 }]}
        />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
          <Text style={styles.muted}>
            {body.length}/{POST_MAX}
          </Text>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="Post" onPress={() => void submit()} busy={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
