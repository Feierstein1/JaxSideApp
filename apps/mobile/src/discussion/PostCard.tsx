import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, profileColor, type PostView } from '@jax/shared';
import { useNameHidden } from '@/auth/UserBadge';
import { formatDistance, postTime } from '@/format';
import { MedalIcons } from '@/profile/Medals';
import { ProfileAvatar } from '@/profile/ProfileAvatar';
import { elevation, RADIUS, SPACE } from '@/tokens';
import { Bone, Pulse } from '@/ui';
import { PhotoGrid } from './PhotoGrid';
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

/**
 * A post (D69, D78). A header in the author's color, rounded on top: profile photo, the
 * username with a ★ on your own posts and medals, and under it the time and distance
 * ("5 min ago · 120 yd"). Below, the post on white with black text, then a row of pill
 * buttons: votes and comments. Header text is white on dark colors and black on light ones.
 * The color, name and photo are the author's current ones, so changes show on all posts.
 * In the feed long posts stop after 8 lines with "Read more".
 */
export function PostCard({
  post,
  onOpen,
  onError,
  onReportPhoto,
  onMore,
  full = false,
}: {
  post: PostView;
  onOpen?: () => void;
  onError?: (m: string) => void;
  /** P6.5: long-press a photo to report it. */
  onReportPhoto?: (photoId: string) => void;
  /** D78: the "•••" menu (report, delete) on the post page. */
  onMore?: () => void;
  full?: boolean;
}) {
  const author = post.author;
  const nameHidden = useNameHidden(); // D73: no ★ on your posts while your name is hidden
  const name = authorName(author);
  const color = profileColor('color' in author ? author.color : 'slate');
  const [clamped, setClamped] = useState(false);
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
      style={({ pressed }) => ({
        marginHorizontal: SPACE.md,
        marginVertical: 6,
        borderRadius: RADIUS.lg,
        backgroundColor: COLORS.background,
        opacity: pressed ? 0.94 : 1,
        ...elevation(1),
      })}
    >
      <View style={{ borderRadius: RADIUS.lg, overflow: 'hidden' }}>
        {/* Header in the author's color. */}
        <View
          style={{
            backgroundColor: color.hex,
            paddingLeft: SPACE.md,
            paddingRight: onMore ? SPACE.xs : SPACE.md,
            paddingVertical: 10,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <Pressable
            onPress={'username' in author ? () => openAuthor(author) : undefined}
            disabled={!('username' in author)}
            accessibilityRole={'username' in author ? 'link' : undefined}
            accessibilityLabel={'username' in author ? `${name}'s profile` : undefined}
          >
            <ProfileAvatar
              name={name}
              url={'avatarUrl' in author ? author.avatarUrl : null}
              size={38}
              ringColor={color.text}
            />
          </Pressable>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <Text
                numberOfLines={1}
                style={{ color: color.text, fontSize: 16, fontWeight: '800', flexShrink: 1 }}
                onPress={'username' in author ? () => openAuthor(author) : undefined}
              >
                {name}
              </Text>
              {post.isMine && !nameHidden ? (
                <Ionicons name="star" size={14} color={color.text} accessibilityLabel="Your post" />
              ) : null}
              {'medals' in author ? (
                <MedalIcons keys={author.medals} color={color.text} size={13} />
              ) : null}
            </View>
            <Text style={{ color: color.text, fontSize: 12.5, fontWeight: '600', marginTop: 1 }}>
              {meta}
            </Text>
          </View>
          {onMore ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="More options"
              onPress={onMore}
              style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={color.text} />
            </Pressable>
          ) : null}
        </View>

        {/* The post itself: white, black text. */}
        <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 4 }}>
          {/* Plain text only (P3.10): user content is never rendered as markup or auto-linked. */}
          {post.body ? (
            <Text
              style={{ fontSize: full ? 17 : 16, lineHeight: full ? 25 : 23, color: COLORS.text }}
              numberOfLines={full ? undefined : CLAMP}
              onTextLayout={
                full ? undefined : (e) => setClamped(e.nativeEvent.lines.length >= CLAMP)
              }
            >
              {post.body}
            </Text>
          ) : null}
          {clamped && !full ? (
            <Text style={{ color: COLORS.primary, fontWeight: '700', marginTop: 4 }}>
              Read more
            </Text>
          ) : null}
          {/* D75: voice posts play right in the card. */}
          {post.voice ? (
            <View style={{ marginTop: post.body ? 10 : 0 }}>
              <VoicePlayer voice={post.voice} />
            </View>
          ) : null}
          <PhotoGrid
            photos={post.photos}
            onLongPress={onReportPhoto ? (p) => onReportPhoto(p.id) : undefined}
          />
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACE.sm,
            paddingHorizontal: 10,
            paddingTop: 6,
            paddingBottom: 10,
          }}
        >
          <VoteControl
            target={{ type: post.kind, id: post.id }}
            score={post.score}
            myVote={post.myVote}
            onError={onError}
          />
          <Pressable
            accessibilityRole={onOpen ? 'button' : undefined}
            accessibilityLabel={`${post.commentCount} comments`}
            onPress={onOpen}
            disabled={!onOpen}
            style={({ pressed }) => [pill, pressed && { opacity: 0.7 }]}
          >
            <Ionicons name="chatbubble-outline" size={17} color={COLORS.textMuted} />
            <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 14 }}>
              {post.commentCount}
            </Text>
          </Pressable>
        </View>
      </View>
    </Pressable>
  );
}

/** D78: the grey pill behind the votes and comments buttons. */
export const pill = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 6,
  height: 36,
  paddingHorizontal: 12,
  borderRadius: RADIUS.pill,
  backgroundColor: COLORS.surfaceMuted,
} as const;

/** D78: the shape of a post while the feed loads. */
export function PostSkeleton() {
  return (
    <Pulse>
      <View
        style={{
          marginHorizontal: SPACE.md,
          marginVertical: 6,
          borderRadius: RADIUS.lg,
          overflow: 'hidden',
          backgroundColor: COLORS.surfaceDarkRaised,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, padding: SPACE.md }}>
          <Bone w={38} h={38} r={19} dark />
          <View style={{ gap: 6 }}>
            <Bone w={120} h={12} dark />
            <Bone w={80} h={10} dark />
          </View>
        </View>
        <View style={{ paddingHorizontal: 14, paddingBottom: 14, gap: 8 }}>
          <Bone w="95%" h={12} dark />
          <Bone w="85%" h={12} dark />
          <Bone w="55%" h={12} dark />
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
            <Bone w={104} h={34} r={17} dark />
            <Bone w={60} h={34} r={17} dark />
          </View>
        </View>
      </View>
    </Pulse>
  );
}
