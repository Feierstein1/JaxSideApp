import { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { COLORS, PHOTOS_MAX, POST_MAX } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { Button, styles } from '@/ui';
import { createPost, markFeedsDirty } from './api';
import { pickPhoto, uploadPhoto, type Uploaded } from './photos';
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
  /** P6.1: photos are uploaded as soon as they're picked; the post attaches them by ID. */
  const [photos, setPhotos] = useState<(Uploaded & { localUri: string })[]>([]);
  const [uploading, setUploading] = useState(false);

  async function addPhoto() {
    setError(undefined);
    const asset = await pickPhoto();
    if (!asset) return;
    setUploading(true);
    try {
      const up = await uploadPhoto(asset.uri);
      setPhotos((p) => [...p, { ...up, localUri: asset.uri }]);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t add the photo.');
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!body.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      const sent = await sendScreened((ok) =>
        createPost(
          target,
          body.trim(),
          ok,
          photos.map((p) => p.id),
        ),
      );
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
            ? 'Posting to your area. People nearby (within about 500 yards) will see it. Your exact location is never shown.'
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
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}>
          {photos.map((p) => (
            <View key={p.id}>
              <Image
                source={{ uri: p.localUri }}
                style={{ width: 76, height: 76, borderRadius: 8 }}
                accessibilityLabel="Photo to post"
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Remove photo"
                onPress={() => setPhotos((all) => all.filter((x) => x.id !== p.id))}
                hitSlop={8}
                style={{ position: 'absolute', top: -6, right: -6 }}
              >
                <Ionicons name="close-circle" size={22} color={COLORS.text} />
              </Pressable>
            </View>
          ))}
          {photos.length < PHOTOS_MAX ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a photo"
              onPress={() => void addPhoto()}
              disabled={uploading}
              style={{
                width: 76,
                height: 76,
                borderRadius: 8,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: COLORS.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {uploading ? (
                <ActivityIndicator color={COLORS.primary} />
              ) : (
                <Ionicons name="image-outline" size={26} color={COLORS.primary} />
              )}
            </Pressable>
          ) : null}
        </View>
        <Text style={[styles.muted, { fontSize: 12 }]}>
          Photos are checked and cleaned of location and camera details before anyone sees them.
        </Text>
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Button title="Post" onPress={() => void submit()} busy={busy || uploading} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
