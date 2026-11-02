import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, Stack } from 'expo-router';
import { PHOTOS_MAX, POST_MAX, profileColor, DARK } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { haptic } from '@/motion';
import { ProfileAvatar } from '@/profile/ProfileAvatar';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { DecoBox } from '@/deco';
import { Banner, FormError, KeyboardSafeView, type IconName } from '@/ui';
import { createPost, markFeedsDirty, type PostTarget } from './api';
import { pickPhotos, uploadPhoto, type Uploaded } from './photos';
import { sendScreened } from './screening';
import { VideoPlayer } from './VideoPlayer';
import { pickVideo, uploadVideo, VIDEO_MAX_SECONDS, type UploadedVideo } from './videos';
import { VoiceRecorder, type UploadedVoice } from './VoiceRecorder';
import { FONT, Text, TextInput } from '@/text';
import { showAlert } from '@/dialog';
import { ensureGuide, reviewGuide } from '@/guides/guide';

type Mode = 'text' | 'voice' | 'video';

/**
 * Write a post (P3.11). Area posts are placed at the author's (rounded) location by the
 * server; room posts go to the given place. The server checks location and limits.
 *
 * D78 / D80: × and a gold Post button in the header; your photo and where it's going; then
 * a switch between the two kinds of post (D75: one kind of attachment per post):
 * - Text & photos: the text (required) with an "Add photo" button right under it.
 * - Voice: the recorder first, with an optional caption.
 * Switching keeps what you made in the other mode, but only the chosen kind is posted.
 */
export function Compose({ target, placeName }: { target: PostTarget; placeName?: string }) {
  /** D125: posting into a citywide topic (everyone in Duval sees it). */
  const topic = target.kind === 'general' && target.topicId ? target : null;
  const { state } = useAuth();
  const user = state.status === 'signedIn' ? state.user : undefined;
  const [mode, setMode] = useState<Mode>('text');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  /** P6.1: photos are uploaded as soon as they're picked; the post attaches them by ID. */
  const [photos, setPhotos] = useState<(Uploaded & { localUri: string })[]>([]);
  const [uploading, setUploading] = useState(false);
  /** D75: a voice post; its text is an optional caption. */
  const [voice, setVoice] = useState<UploadedVoice | null>(null);
  /** D102: a video post; its text is an optional caption. */
  const [video, setVideo] = useState<(UploadedVideo & { localUri: string }) | null>(null);
  // D158: a photo post needs no text.
  const ready =
    mode === 'text' ? !!body.trim() || photos.length > 0 : mode === 'voice' ? !!voice : !!video;
  const canPost = ready && !busy && !uploading;
  const nearLimit = body.length > POST_MAX * 0.9;
  const guideKey = target.kind === 'general' ? 'areaPost' : 'placePost';

  // D104: the first post of each kind shows its guide; closing it leaves Compose.
  useEffect(() => {
    void ensureGuide(guideKey).then((ok) => {
      if (!ok) router.back();
    });
  }, [guideKey]);

  async function addPhoto() {
    setError(undefined);
    if (!(await ensureGuide('photo'))) return;
    // D175: pick as many as still fit (up to PHOTOS_MAX in all) and upload them one by one.
    const assets = await pickPhotos({ limit: PHOTOS_MAX - photos.length });
    if (!assets.length) return;
    setUploading(true);
    try {
      for (const asset of assets) {
        const up = await uploadPhoto(asset);
        setPhotos((p) => [...p, { ...up, localUri: asset.uri }]);
      }
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t add the photo.');
    } finally {
      setUploading(false);
    }
  }

  async function addVideo(record: boolean) {
    setError(undefined);
    if (!(await ensureGuide('video'))) return;
    const asset = await pickVideo(record);
    if (!asset) return;
    setUploading(true);
    try {
      const up = await uploadVideo(asset);
      setVideo({ ...up, localUri: asset.uri });
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t add the video.');
    } finally {
      setUploading(false);
    }
  }

  /**
   * D87 / D102: a post carries photos, a voice clip or a video: one kind. If the other kind is also
   * attached, say so before posting and let the person choose, instead of quietly
   * leaving it out.
   */
  function submit() {
    if (!ready) return;
    const others = [
      mode !== 'text' && photos.length
        ? photos.length === 1
          ? 'your photo'
          : `your ${photos.length} photos`
        : null,
      mode !== 'voice' && voice ? 'your voice recording' : null,
      mode !== 'video' && video ? 'your video' : null,
    ].filter((x): x is string => !!x);
    if (!others.length) return void send();
    const leftOut = others.join(' and ');
    showAlert(
      'One kind of attachment per post',
      `A post can have photos, a voice recording or a video, but only one kind. If you post now, ${leftOut} won’t be included.`,
      [
        { text: 'Go back', style: 'cancel' },
        { text: 'Post anyway', onPress: () => void send() },
      ],
      { icon: 'images-outline', tone: 'warning' },
    );
  }

  async function send() {
    setBusy(true);
    setError(undefined);
    try {
      const sent = await sendScreened((ok) =>
        createPost(
          target,
          body.trim(),
          ok,
          mode === 'text' ? photos.map((p) => p.id) : [],
          mode === 'voice' ? voice?.id : undefined,
          mode === 'video' ? video?.id : undefined,
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

  const textBox = (
    <View
      style={{
        borderRadius: RADIUS.lg,
        backgroundColor: DARK.card,
        padding: SPACE.md,
        paddingBottom: SPACE.sm,
      }}
    >
      <TextInput
        accessibilityLabel={mode === 'text' ? 'Post text' : 'Caption'}
        placeholder={
          mode !== 'text'
            ? 'Add a caption (optional)'
            : topic
              ? 'Share your take with Jacksonville…'
              : target.kind === 'general'
                ? 'What’s happening around here?'
                : 'Share something about this place…'
        }
        value={body}
        onChangeText={setBody}
        maxLength={POST_MAX}
        multiline
        autoFocus={mode === 'text'}
        textAlignVertical="top"
        style={{
          fontSize: mode === 'text' ? 18 : 16,
          lineHeight: mode === 'text' ? 26 : 23,
          minHeight: mode === 'text' ? 130 : 64,
        }}
      />
      <Text
        accessibilityLabel={`${POST_MAX - body.length} characters left`}
        style={[
          TYPE.caption,
          {
            alignSelf: 'flex-end',
            fontVariant: ['tabular-nums'],
            color: nearLimit ? DARK.error : DARK.textMuted,
            fontWeight: nearLimit ? '800' : '500',
          },
        ]}
      >
        {nearLimit ? POST_MAX - body.length : `${body.length}/${POST_MAX}`}
      </Text>
    </View>
  );

  const full = photos.length >= PHOTOS_MAX;

  return (
    <KeyboardSafeView style={{ flex: 1, backgroundColor: DARK.page }}>
      <Stack.Screen
        options={{
          headerLeft: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Cancel"
              onPress={() => router.back()}
              style={{ width: 44, height: 44, justifyContent: 'center', marginRight: 4 }}
            >
              <Ionicons name="close" size={26} color={DARK.text} />
            </Pressable>
          ),
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Post"
              accessibilityState={{ disabled: !canPost, busy }}
              disabled={!canPost}
              onPress={submit}
              style={({ pressed }) => ({
                minWidth: 72,
                height: 36,
                paddingHorizontal: 16,
                borderRadius: RADIUS.pill,
                alignItems: 'center',
                justifyContent: 'center',
                // Gold with black text (D33); greyed out until there's something to post.
                backgroundColor: canPost ? DARK.accent : DARK.raised,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              {busy ? (
                <ActivityIndicator color={DARK.onAccent} />
              ) : (
                <Text
                  style={{
                    color: canPost ? DARK.onAccent : DARK.textMuted,
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
        contentContainerStyle={{ padding: SPACE.lg, gap: SPACE.md, paddingBottom: 48 }}
        keyboardShouldPersistTaps="handled"
      >
        {/* Who's posting, and where it goes. */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
          {user ? (
            <ProfileAvatar
              name={user.username}
              url={user.avatarUrl}
              size={44}
              ringColor={profileColor(user.color).hex}
              fill={profileColor(user.color).hex}
            />
          ) : null}
          <View style={{ flex: 1, gap: 4 }}>
            {user ? <Text style={TYPE.label}>{user.username}</Text> : null}
            <View
              style={{
                alignSelf: 'flex-start',
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: RADIUS.pill,
                backgroundColor: DARK.tealSoft,
              }}
            >
              <Ionicons
                name={
                  topic ? 'globe-outline' : target.kind === 'general' ? 'location' : 'storefront'
                }
                size={13}
                color={DARK.tealText}
              />
              <Text
                numberOfLines={1}
                style={{ color: DARK.tealText, fontWeight: '700', fontSize: 13 }}
              >
                {topic
                  ? (topic.topicTitle ?? 'Citywide')
                  : target.kind === 'general'
                    ? 'People near you'
                    : (placeName ?? 'This place')}
              </Text>
            </View>
          </View>
        </View>

        {/* D80: pick the kind of post first. */}
        <PostKindPicker value={mode} onChange={setMode} />

        {mode === 'text' ? (
          <>
            {textBox}

            {/* D80: the photo button sits right under the text, easy to find. */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACE.sm }}>
              {photos.map((p) => (
                <View key={p.id}>
                  <Image
                    source={{ uri: p.localUri }}
                    style={{ width: 92, height: 92, borderRadius: RADIUS.md }}
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
                      backgroundColor: DARK.bar,
                    }}
                  >
                    <Ionicons name="close" size={16} color={DARK.text} />
                  </Pressable>
                </View>
              ))}
              {uploading ? (
                <View
                  style={{
                    width: 92,
                    height: 92,
                    borderRadius: RADIUS.md,
                    backgroundColor: DARK.raised,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <ActivityIndicator color={DARK.accent} />
                </View>
              ) : null}
            </View>
            {!full ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Add a photo, ${photos.length} of ${PHOTOS_MAX} added`}
                accessibilityState={{ disabled: uploading }}
                onPress={() => void addPhoto()}
                disabled={uploading}
                style={({ pressed }) => ({
                  minHeight: 56,
                  borderRadius: RADIUS.lg,
                  borderWidth: 1.5,
                  borderStyle: 'dashed',
                  borderColor: DARK.accent,
                  backgroundColor: pressed ? DARK.accentSoft : 'transparent',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: SPACE.sm,
                  opacity: uploading ? 0.5 : 1,
                })}
              >
                <Ionicons name="image" size={22} color={DARK.accent} />
                <Text style={{ color: DARK.accent, fontWeight: '800', fontSize: 15.5 }}>
                  {photos.length ? 'Add more photos' : 'Add photos'}
                </Text>
                <Text style={[TYPE.caption, { color: DARK.textMuted }]}>
                  {photos.length}/{PHOTOS_MAX}
                </Text>
              </Pressable>
            ) : (
              <Text style={[TYPE.caption, { color: DARK.textMuted, textAlign: 'center' }]}>
                {PHOTOS_MAX} photos is the most a post can have.
              </Text>
            )}
            {voice ? (
              <Banner icon="mic-off-outline">
                Your voice recording won’t be posted with a text post. Switch to Voice to post it.
              </Banner>
            ) : null}
          </>
        ) : mode === 'video' ? (
          <>
            {/* D102: one video, up to 30 seconds, posted as recorded. */}
            <View
              style={{
                borderRadius: RADIUS.lg,
                backgroundColor: DARK.card,
                padding: SPACE.md,
                gap: SPACE.sm,
              }}
            >
              <Text style={[TYPE.overline, { color: DARK.textMuted }]}>Video</Text>
              {video ? (
                <>
                  <VideoPlayer video={video} localUri={video.localUri} />
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => setVideo(null)}
                    style={{ alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' }}
                  >
                    <Text style={{ color: DARK.accent, fontWeight: '800' }}>Remove video</Text>
                  </Pressable>
                </>
              ) : uploading ? (
                <View
                  style={{ minHeight: 56, alignItems: 'center', justifyContent: 'center', gap: 6 }}
                >
                  <ActivityIndicator color={DARK.accent} />
                  <Text style={[TYPE.caption, { color: DARK.textMuted }]}>
                    Uploading the video…
                  </Text>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
                  {[
                    { record: false, icon: 'film-outline' as const, label: 'Choose a video' },
                    {
                      record: true,
                      icon: 'videocam' as const,
                      label: `Record (${VIDEO_MAX_SECONDS} s)`,
                    },
                  ].map((b) => (
                    <Pressable
                      key={b.label}
                      accessibilityRole="button"
                      onPress={() => void addVideo(b.record)}
                      style={({ pressed }) => ({
                        flex: 1,
                        minHeight: 56,
                        borderRadius: RADIUS.lg,
                        borderWidth: 1.5,
                        borderStyle: 'dashed',
                        borderColor: DARK.accent,
                        backgroundColor: pressed ? DARK.accentSoft : 'transparent',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                      })}
                    >
                      <Ionicons name={b.icon} size={22} color={DARK.accent} />
                      <Text style={{ color: DARK.accent, fontWeight: '800', fontSize: 14 }}>
                        {b.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </View>
            {textBox}
          </>
        ) : (
          <>
            <View
              style={{
                borderRadius: RADIUS.lg,
                backgroundColor: DARK.card,
                padding: SPACE.md,
                gap: SPACE.sm,
              }}
            >
              <Text style={[TYPE.overline, { color: DARK.textMuted }]}>Recording</Text>
              <VoiceRecorder value={voice} onChange={setVoice} />
            </View>
            {textBox}
            {photos.length ? (
              <Banner icon="images-outline">
                {`Your ${photos.length === 1 ? 'photo' : `${photos.length} photos`} won’t be posted with a voice post. Switch to Text & photos to post ${photos.length === 1 ? 'it' : 'them'}.`}
              </Banner>
            ) : null}
          </>
        )}

        {error ? <FormError>{error}</FormError> : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: SPACE.xs }}>
          <Ionicons name="shield-checkmark-outline" size={14} color={DARK.textMuted} />
          <Text style={[TYPE.caption, { color: DARK.textMuted, flex: 1 }]}>
            {topic
              ? 'Everyone in Jacksonville can see this in the topic. Your location is never shown.'
              : target.kind === 'general'
                ? 'People within about 500 yards will see this. Your exact location is never shown.'
                : `Posting in ${placeName ?? 'this place'}’s discussion.`}{' '}
            {mode === 'text'
              ? 'Photos are cleaned of location and camera details.'
              : mode === 'video'
                ? 'Videos are cleaned of location and device details.'
                : 'Recordings are cleaned of location and device details.'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="link"
          onPress={() => reviewGuide(guideKey)}
          hitSlop={8}
          style={{ alignSelf: 'flex-start', minHeight: 32, justifyContent: 'center' }}
        >
          <Text style={{ color: DARK.accent, fontWeight: '700', fontSize: 13 }}>Posting rules</Text>
        </Pressable>
      </ScrollView>
    </KeyboardSafeView>
  );
}

/**
 * D136: the kind of post. Text & photos (the default) is the big option on its own line;
 * Voice and Video sit side by side under it. One is picked at a time.
 */
function PostKindPicker({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  const option = (key: Mode, label: string, icon: IconName, big = false) => {
    const active = key === value;
    const fg = active ? DARK.onAccent : DARK.textMuted;
    return (
      <Pressable
        key={key}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        onPress={() => {
          if (!active) haptic.select();
          onChange(key);
        }}
        style={{ flex: 1 }}
      >
        <DecoBox
          shape="arrow"
          cut={10}
          fill={active ? DARK.accent : 'transparent'}
          style={{
            minHeight: big ? 44 : 36,
            paddingHorizontal: 12,
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'row',
            gap: 6,
          }}
        >
          <Ionicons name={icon} size={big ? 17 : 14} color={fg} />
          <Text
            numberOfLines={1}
            style={{
              color: fg,
              fontFamily: FONT.deco,
              textTransform: 'uppercase',
              letterSpacing: 1,
              fontSize: big ? 14 : 12,
            }}
          >
            {label}
          </Text>
        </DecoBox>
      </Pressable>
    );
  };
  return (
    <DecoBox
      accessibilityRole="tablist"
      shape="arrow"
      cut={12}
      fill={DARK.raised}
      style={{ padding: 4, paddingHorizontal: 8, gap: 2 }}
    >
      {option('text', 'Text & photos', 'create-outline', true)}
      <View style={{ flexDirection: 'row', gap: 2 }}>
        {option('voice', 'Voice', 'mic-outline')}
        {option('video', 'Video', 'videocam-outline')}
      </View>
    </DecoBox>
  );
}
