import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { contrastRatio, DARK, profileColor, type PostView } from '@jax/shared';
import { formatDistance, postTime } from '@/format';
import { AdminTag } from '@/profile/AdminTag';
import { MedalIcons } from '@/profile/Medals';
import { ProfileAvatar } from '@/profile/ProfileAvatar';
import { Text } from '@/text';
import { RADIUS, SPACE } from '@/tokens';
import { DECO, DecoBox } from '@/deco';
import { Bone, Pulse } from '@/ui';
import { PhotoGrid } from './PhotoGrid';
import { VideoPlayer } from './VideoPlayer';
import { VoicePlayer } from './VoicePlayer';
import { VoteControl } from './VoteControl';

type AnyAuthor = { username: string } | { guest: true } | { deleted: true };

export function authorName(a: AnyAuthor): string {
  if ('username' in a) return a.username;
  if ('guest' in a) return 'GUEST';
  return 'deleted user';
}

/** Opens a registered author's profile (P4.8); guests and deleted users aren't links. */
export function openAuthor(a: AnyAuthor) {
  if ('username' in a) router.push(`/user/${encodeURIComponent(a.username)}`);
}

const CLAMP = 8;
/** D79: a post this well received gets a small "Popular" tag. */
const POPULAR = 10;
/** D140: posts from the last 24 hours get a NEW tag in the top-right corner. */
const NEW_FOR_MS = 24 * 3_600_000;

/**
 * A post (D69, D79): a dark card with a thick stripe down the left in the author's
 * account color (the same stripe idea as place cards). Top row: photo ringed in that
 * color, username (★ on your own, medals), and "5 min ago · 120 yd" under it. Then the
 * text, voice clip or photos, and a row of pill buttons: votes and comments. The color,
 * name and photo are the author's current ones, so changes show on all posts. In the feed
 * long posts stop after 8 lines with "Read more".
 */
export function PostCard({
  post,
  onOpen,
  onError,
  onReportPhoto,
  onMore,
  full = false,
  showWhere = false,
}: {
  post: PostView;
  onOpen?: () => void;
  onError?: (m: string) => void;
  /** P6.5: long-press a photo to report it. */
  onReportPhoto?: (photoId: string) => void;
  /** D78: the "•••" menu (report, delete) on the post page. */
  onMore?: () => void;
  full?: boolean;
  /** D115: under the name, where the post was made (your own profile's list). */
  showWhere?: boolean;
}) {
  const author = post.author;
  const name = authorName(author);
  const color = profileColor('color' in author ? author.color : 'slate');
  const [clamped, setClamped] = useState(false);
  const faint = contrastRatio(color.hex, DARK.card) < 2;
  const isUser = 'username' in author;
  const isNew = Date.now() - Date.parse(post.createdAt) < NEW_FOR_MS;
  const meta = [
    postTime(post.createdAt),
    post.distanceMeters !== null ? formatDistance(post.distanceMeters) : null,
    post.editedAt ? 'edited' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole={onOpen ? 'button' : undefined}
      accessibilityLabel={`Post by ${name}${post.isMine ? ' (you)' : ''}, ${meta}. ${post.voice ? 'Voice post. ' : ''}${post.body}`}
      onPress={onOpen}
      disabled={!onOpen}
      style={{ marginHorizontal: SPACE.md, marginVertical: 6 }}
    >
      {({ pressed }) => (
        // D127: the top corners clipped like the icon's stepped frame.
        <DecoBox shape="chamferTop" cut={14} fill={pressed ? DARK.raised : DARK.card}>
          {isNew ? (
            // D140: just inside the clipped top-right corner, above the name row.
            <View
              accessible
              accessibilityLabel="New, posted in the last day"
              style={{
                position: 'absolute',
                top: 3,
                right: 18,
                paddingHorizontal: 6,
                height: 15,
                borderRadius: 3,
                justifyContent: 'center',
                backgroundColor: DARK.accent,
                zIndex: 1,
              }}
            >
              <Text
                style={{
                  color: DARK.onAccent,
                  fontSize: 9.5,
                  fontWeight: '800',
                  letterSpacing: 1,
                }}
              >
                NEW
              </Text>
            </View>
          ) : null}
          {/* The author's color as a stripe down the left edge (below the clipped corner). */}
          <View
            style={{
              position: 'absolute',
              left: 0,
              top: 14,
              bottom: 0,
              width: 5,
              backgroundColor: color.hex,
              // D79: very dark colors (navy, black) get a light edge so the stripe still shows.
              borderRightWidth: faint ? 1.5 : 0,
              borderRightColor: DARK.border,
            }}
          />
          <View
            style={{ paddingLeft: 17, paddingRight: SPACE.md, paddingTop: 14, paddingBottom: 10 }}
          >
            {/* Author row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
              <Pressable
                onPress={isUser ? () => openAuthor(author) : undefined}
                disabled={!isUser}
                accessibilityRole={isUser ? 'link' : undefined}
                accessibilityLabel={isUser ? `${name}'s profile` : undefined}
              >
                <ProfileAvatar
                  name={name}
                  url={'avatarUrl' in author ? author.avatarUrl : null}
                  size={42}
                  ringColor={faint ? DARK.border : color.hex}
                  fill={color.hex}
                />
              </Pressable>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text
                    numberOfLines={1}
                    style={{ fontSize: 16, fontWeight: '800', flexShrink: 1, letterSpacing: -0.2 }}
                    onPress={isUser ? () => openAuthor(author) : undefined}
                  >
                    {name}
                  </Text>
                  {post.isMine ? (
                    <Ionicons
                      name="star"
                      size={13}
                      color={DARK.accent}
                      accessibilityLabel="Your post"
                    />
                  ) : null}
                  {'medals' in author ? <MedalIcons medals={author.medals} size={16} /> : null}
                  {/* D103: a verified owner of this place (its discussion only). */}
                  {'owner' in author && author.owner ? (
                    <View
                      accessibilityLabel="Verified owner"
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 3,
                        paddingHorizontal: 6,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: DARK.accent,
                      }}
                    >
                      <Ionicons name="ribbon" size={11} color={DARK.onAccent} />
                      <Text style={{ color: DARK.onAccent, fontSize: 11, fontWeight: '800' }}>
                        Owner
                      </Text>
                    </View>
                  ) : null}
                </View>
                {'admin' in author && author.admin ? <AdminTag /> : null}
                <Text
                  style={{ color: DARK.textMuted, fontSize: 13, fontWeight: '500', marginTop: 1 }}
                >
                  {meta}
                </Text>
                {showWhere ? (
                  <View
                    accessible
                    accessibilityLabel={
                      post.topic
                        ? `Posted in the citywide topic ${post.topic.title}`
                        : post.place
                          ? `Posted at ${post.place.name}`
                          : `Posted near ${post.area ?? 'you'}`
                    }
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}
                  >
                    <Ionicons
                      name={post.topic ? 'globe-outline' : post.place ? 'storefront' : 'location'}
                      size={12}
                      color={DARK.tealText}
                    />
                    <Text
                      numberOfLines={1}
                      style={{
                        color: DARK.tealText,
                        fontSize: 13,
                        fontWeight: '700',
                        flexShrink: 1,
                      }}
                    >
                      {post.topic
                        ? `Citywide: ${post.topic.title}`
                        : post.place
                          ? post.place.name
                          : (post.area ?? 'Area post')}
                    </Text>
                  </View>
                ) : null}
              </View>
              {post.score >= POPULAR ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 3,
                    paddingHorizontal: 8,
                    height: 24,
                    borderRadius: RADIUS.pill,
                    backgroundColor: DARK.accentSoft,
                  }}
                >
                  <Ionicons name="flame" size={12} color={DARK.accent} />
                  <Text style={{ color: DARK.accent, fontSize: 11.5, fontWeight: '800' }}>
                    Popular
                  </Text>
                </View>
              ) : null}
              {onMore ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="More options"
                  onPress={onMore}
                  style={{
                    width: 44,
                    height: 44,
                    marginRight: -6,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Ionicons name="ellipsis-horizontal" size={22} color={DARK.textMuted} />
                </Pressable>
              ) : null}
            </View>

            {/* The post itself. Plain text only (P3.10): never rendered as markup or auto-linked. */}
            {post.body ? (
              <Text
                style={{
                  fontSize: full ? 17 : 16,
                  lineHeight: full ? 26 : 24,
                  marginTop: SPACE.md,
                }}
                numberOfLines={full ? undefined : CLAMP}
                onTextLayout={
                  full ? undefined : (e) => setClamped(e.nativeEvent.lines.length >= CLAMP)
                }
              >
                {post.body}
              </Text>
            ) : null}
            {clamped && !full ? (
              <Text style={{ color: DARK.accent, fontWeight: '700', marginTop: 4 }}>Read more</Text>
            ) : null}
            {/* D75: voice posts play right in the card. */}
            {post.voice ? (
              <View style={{ marginTop: SPACE.md }}>
                <VoicePlayer voice={post.voice} />
              </View>
            ) : null}
            {/* D102: plays when tapped (nothing loads while scrolling). */}
            {post.video ? (
              <View style={{ marginTop: SPACE.md }}>
                <VideoPlayer video={post.video} />
              </View>
            ) : null}
            <PhotoGrid
              photos={post.photos}
              onLongPress={onReportPhoto ? (p) => onReportPhoto(p.id) : undefined}
            />

            {/* Actions */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: SPACE.sm,
                marginTop: SPACE.md,
              }}
            >
              <VoteControl
                target={{ type: post.kind, id: post.id }}
                score={post.score}
                myVote={post.myVote}
                split={full ? { up: post.upCount, down: post.downCount } : undefined}
                onError={onError}
              />
              <Pressable
                accessibilityRole={onOpen ? 'button' : undefined}
                accessibilityLabel={`${post.commentCount} comments`}
                onPress={onOpen}
                disabled={!onOpen}
                style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
              >
                <DecoBox shape="arrow" cut={DECO.point} fill={DARK.raised} style={pill}>
                  <Ionicons name="chatbubble-outline" size={17} color={DARK.textMuted} />
                  <Text style={{ fontWeight: '700', fontSize: 14 }}>{post.commentCount}</Text>
                </DecoBox>
              </Pressable>
              <View style={{ flex: 1 }} />
              {post.voice ? <Kind icon="mic" label="Voice" /> : null}
              {post.video ? <Kind icon="videocam" label="Video" /> : null}
              {post.photos.length ? (
                <Kind
                  icon="images"
                  label={post.photos.length === 1 ? 'Photo' : `${post.photos.length} photos`}
                />
              ) : null}
            </View>
          </View>
        </DecoBox>
      )}
    </Pressable>
  );
}

/** A small "what's in it" tag at the right of the action row. */
function Kind({ icon, label }: { icon: 'mic' | 'images' | 'videocam'; label: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Ionicons name={icon} size={14} color={DARK.textMuted} />
      <Text style={{ color: DARK.textMuted, fontSize: 12.5, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

/** The layout of the votes and comments buttons (D127: drawn arrow-ended by DecoBox). */
export const pill = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  height: 36,
  paddingHorizontal: 16,
} as const;

/** The shape of a post while the feed loads. */
export function PostSkeleton() {
  return (
    <Pulse>
      <View
        style={{
          marginHorizontal: SPACE.md,
          marginVertical: 6,
          borderRadius: RADIUS.lg,
          backgroundColor: DARK.card,
          padding: 14,
          paddingLeft: 17,
          gap: 10,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Bone w={42} h={42} r={21} />
          <View style={{ gap: 6 }}>
            <Bone w={120} h={12} />
            <Bone w={84} h={10} />
          </View>
        </View>
        <Bone w="95%" h={12} />
        <Bone w="85%" h={12} />
        <Bone w="55%" h={12} />
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
          <Bone w={108} h={36} r={18} />
          <Bone w={62} h={36} r={18} />
        </View>
      </View>
    </Pulse>
  );
}
