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
import { router, Stack } from 'expo-router';
import { BRAND, COLORS, PHOTOS_MAX, POST_MAX, profileColor } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { haptic } from '@/motion';
import { ProfileAvatar } from '@/profile/ProfileAvatar';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { FormError } from '@/ui';
import { createPost, markFeedsDirty } from './api';
import { pickPhoto, uploadPhoto, type Uploaded } from './photos';
import { sendScreened } from './screening';
import { VoiceRecorder, type UploadedVoice } from './VoiceRecorder';

/**
 * Write a post (P3.11). Area posts are placed at the author's (rounded) location by the
 * server; room posts go to the given place. The server checks location and limits.
 *
 * D78: laid out like other social apps' composers: Cancel and a gold Post button in the
 * header, your photo and where it's going at the top, a large borderless text area, and
 * a toolbar for photos with the character count.
 */
export function Compose({
  target,
  placeName,
}: {
  target: { kind: 'general' } | { kind: 'business'; placeId: string };
  placeName?: string;
}) {
  const { state } = useAuth();
  const user = state.status === 'signedIn' ? state.user : undefined;
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  /** P6.1: photos are uploaded as soon as they're picked; the post attaches them by ID. */
  const [photos, setPhotos] = useState<(Uploaded & { localUri: string })[]>([]);
  const [uploading, setUploading] = useState(false);
  /** D75: a voice post (instead of photos); text becomes an optional caption. */
  const [voice, setVoice] = useState<UploadedVoice | null>(null);
  const canPost = (!!body.trim() || !!voice) && !busy && !uploading;
  const nearLimit = body.length > POST_MAX * 0.9;

  async function addPhoto() {
    setError(undefined);
    const asset = await pickPhoto();
    if (!asset) return;
    setUploading(true);
    try {
      const up = await uploadPhoto(asset);
      setPhotos((p) => [...p, { ...up, localUri: asset.uri }]);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t add the photo.');
    } finally {
      setUploading(false);
    }
  }

  async function submit() {
    if (!body.trim() && !voice) return;
    setBusy(true);
    setError(undefined);
    try {
      const sent = await sendScreened((ok) =>
        createPost(
          target,
          body.trim(),
          ok,
          photos.map((p) => p.id),
          voice?.id,
        ),
      );
      if (!sent) return; // chose to edit after a warning
      haptic.success();
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
      style={{ flex: 1, backgroundColor: COLORS.background }}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
    >
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.back()}
              style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 }}
            >
              <Text style={{ color: COLORS.onSurfaceInverse, fontSize: 16, fontWeight: '600' }}>
                Cancel
              </Text>
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Post"
              accessibilityState={{ disabled: !canPost, busy }}
              disabled={!canPost}
              onPress={() => void submit()}
              style={({ pressed }) => ({
                minWidth: 72,
                height: 36,
                paddingHorizontal: 16,
                borderRadius: RADIUS.pill,
                alignItems: 'center',
                justifyContent: 'center',
                // Gold with black text (D33); greyed out until there's something to post.
                backgroundColor: canPost ? BRAND.gold : COLORS.surfaceDarkRaised,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              {busy ? (
                <ActivityIndicator color={COLORS.onAccent} />
              ) : (
                <Text
                  style={{
                    color: canPost ? COLORS.onAccent : COLORS.onSurfaceDarkMuted,
                    fontWeight: '800',
                    fontSize: 15,
                  }}
                >
                  Post
                </Text>
              )}
            </Pressable>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={{ padding: SPACE.lg, gap: SPACE.md }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
          {user ? (
            <ProfileAvatar
              name={user.username}
              url={user.avatarUrl}
              size={44}
              ringColor={profileColor(user.color).hex}
            />
          ) : null}
          <View style={{ flex: 1, gap: 4 }}>
            {user ? (
              <Text style={[TYPE.label, { color: COLORS.text }]}>{user.username}</Text>
            ) : null}
            {/* Where the post is going. */}
            <View
              style={{
                alignSelf: 'flex-start',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: RADIUS.pill,
                backgroundColor: COLORS.primarySoft,
              }}
            >
              <Ionicons
                name={target.kind === 'general' ? 'location' : 'storefront'}
                size={13}
                color={COLORS.primary}
              />
              <Text
                numberOfLines={1}
                style={{ color: COLORS.primary, fontWeight: '700', fontSize: 13 }}
              >
                {target.kind === 'general' ? 'People near you' : (placeName ?? 'This place')}
              </Text>
            </View>
          </View>
        </View>

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
          style={{ fontSize: 19, lineHeight: 26, color: COLORS.text, minHeight: 140 }}
        />

        {photos.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
            {photos.map((p) => (
              <View key={p.id}>
                <Image
                  source={{ uri: p.localUri }}
                  style={{ width: 96, height: 96, borderRadius: RADIUS.md }}
                  accessibilityLabel="Photo to post"
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Remove photo"
                  onPress={() => setPhotos((all) => all.filter((x) => x.id !== p.id))}
                  hitSlop={10}
                  style={{
                    position: 'absolute',
                    top: 4,
                    right: 4,
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: COLORS.surfaceInverse,
                  }}
                >
                  <Ionicons name="close" size={16} color={COLORS.onSurfaceInverse} />
                </Pressable>
              </View>
            ))}
            {uploading ? (
              <View
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: RADIUS.md,
                  backgroundColor: COLORS.surfaceMuted,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <ActivityIndicator color={COLORS.primary} />
              </View>
            ) : null}
          </View>
        ) : null}

        {/* D75: one kind of attachment per post: photos or a voice clip. */}
        {photos.length === 0 && !uploading ? (
          <VoiceRecorder value={voice} onChange={setVoice} />
        ) : null}

        {error ? <FormError>{error}</FormError> : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="shield-checkmark-outline" size={14} color={COLORS.textMuted} />
          <Text style={[TYPE.caption, { color: COLORS.textMuted, flex: 1 }]}>
            {target.kind === 'general'
              ? 'People within about 500 yards will see this. Your exact location is never shown.'
              : `Posting in ${placeName ?? 'this place'}’s discussion.`}{' '}
            Photos are cleaned of location and camera details.
          </Text>
        </View>
      </ScrollView>

      {/* D78: attachment toolbar, sits on the keyboard. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.sm,
          paddingHorizontal: SPACE.md,
          paddingVertical: SPACE.sm,
          borderTopWidth: 1,
          borderTopColor: COLORS.hairline,
          backgroundColor: COLORS.background,
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={voice ? 'Add a photo (remove the voice clip first)' : 'Add a photo'}
          accessibilityState={{ disabled: !!voice || uploading || photos.length >= PHOTOS_MAX }}
          onPress={() => void addPhoto()}
          disabled={!!voice || uploading || photos.length >= PHOTOS_MAX}
          style={({ pressed }) => ({
            width: 44,
            height: 44,
            borderRadius: 22,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: pressed ? COLORS.primarySoft : 'transparent',
            opacity: voice || photos.length >= PHOTOS_MAX ? 0.35 : 1,
          })}
        >
          <Ionicons name="image-outline" size={25} color={COLORS.primary} />
        </Pressable>
        <Text style={[TYPE.caption, { color: COLORS.textMuted }]}>
          {photos.length > 0 ? `${photos.length}/${PHOTOS_MAX} photos` : ''}
        </Text>
        <View style={{ flex: 1 }} />
        <Text
          accessibilityLabel={`${POST_MAX - body.length} characters left`}
          style={[
            TYPE.caption,
            {
              fontVariant: ['tabular-nums'],
              color: nearLimit ? COLORS.error : COLORS.textMuted,
              fontWeight: nearLimit ? '800' : '500',
            },
          ]}
        >
          {nearLimit ? POST_MAX - body.length : `${body.length}/${POST_MAX}`}
        </Text>
      </View>
    </KeyboardAvoidingView>
  );
}
