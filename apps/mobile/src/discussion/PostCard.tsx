import { Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, profileColor, type PostView } from '@jax/shared';
import { formatDistance, postTime } from '@/format';
import { MedalIcons } from '@/profile/Medals';
import { ProfileAvatar } from '@/profile/ProfileAvatar';
import { PhotoGrid } from './PhotoGrid';
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

const BORDER = 3;
const RADIUS = 12;

/**
 * A post (D69). A header in the author's color, rounded on top: profile photo, username
 * (larger), a star on your own posts, medals, and on the right the time ("5 min ago" up to
 * 3 days, then the date). Below it the post on white with black text, framed by a 3 px
 * border in the same color, and the votes/comments row under a divider in that color.
 * Header text is white on dark colors and black on light ones. The color, name and photo
 * are the author's current ones, so changes show on all their posts.
 */
export function PostCard({
  post,
  onOpen,
  onError,
  onReportPhoto,
  full = false,
}: {
  post: PostView;
  onOpen?: () => void;
  onError?: (m: string) => void;
  /** P6.5: long-press a photo to report it. */
  onReportPhoto?: (photoId: string) => void;
  full?: boolean;
}) {
  const author = post.author;
  const name = authorName(author);
  const color = profileColor('color' in author ? author.color : 'slate');
  const extras = [
    post.editedAt ? 'edited' : null,
    post.distanceMeters !== null ? formatDistance(post.distanceMeters) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole={onOpen ? 'button' : undefined}
      accessibilityLabel={`Post by ${name}${post.isMine ? ' (you)' : ''}, ${postTime(post.createdAt)}. ${post.body}`}
      onPress={onOpen}
      disabled={!onOpen}
      style={({ pressed }) => ({
        marginHorizontal: 12,
        marginVertical: 7,
        opacity: pressed ? 0.92 : 1,
        shadowColor: COLORS.shadow,
        shadowOpacity: 0.08,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      })}
    >
      {/* Header in the author's color. */}
      <View
        style={{
          backgroundColor: color.hex,
          borderTopLeftRadius: RADIUS,
          borderTopRightRadius: RADIUS,
          paddingHorizontal: 12,
          paddingVertical: 9,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 9,
        }}
      >
        <ProfileAvatar
          name={name}
          url={'avatarUrl' in author ? author.avatarUrl : null}
          size={34}
          ringColor={color.text}
        />
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 5 }}>
          <Text
            numberOfLines={1}
            style={{ color: color.text, fontSize: 18, fontWeight: '800', flexShrink: 1 }}
            onPress={'username' in author ? () => openAuthor(author) : undefined}
            accessibilityRole={'username' in author ? 'link' : undefined}
          >
            {name}
          </Text>
          {post.isMine ? (
            <Ionicons name="star" size={15} color={color.text} accessibilityLabel="Your post" />
          ) : null}
          {'medals' in author ? (
            <MedalIcons keys={author.medals} color={color.text} size={14} />
          ) : null}
        </View>
        <Text style={{ color: color.text, fontSize: 13, fontWeight: '600' }}>
          {postTime(post.createdAt)}
        </Text>
      </View>

      {/* The post itself: white, black text, framed in the author's color. */}
      <View
        style={{
          backgroundColor: COLORS.background,
          borderWidth: BORDER,
          borderTopWidth: 0,
          borderColor: color.hex,
          borderBottomLeftRadius: RADIUS,
          borderBottomRightRadius: RADIUS,
        }}
      >
        <View style={{ padding: 14 }}>
          {/* Plain text only (P3.10): user content is never rendered as markup or auto-linked. */}
          <Text
            style={{ fontSize: 16, lineHeight: 22, color: COLORS.text }}
            numberOfLines={full ? undefined : 8}
          >
            {post.body}
          </Text>
          <PhotoGrid
            photos={post.photos}
            onLongPress={onReportPhoto ? (p) => onReportPhoto(p.id) : undefined}
          />
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 18,
            paddingHorizontal: 14,
            paddingVertical: 9,
            borderTopWidth: 2,
            borderTopColor: color.hex,
          }}
        >
          <VoteControl
            target={{ type: post.kind, id: post.id }}
            score={post.score}
            myVote={post.myVote}
            onError={onError}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Ionicons name="chatbubble-outline" size={18} color={COLORS.textMuted} />
            <Text style={{ color: COLORS.textMuted, fontWeight: '600' }}>{post.commentCount}</Text>
          </View>
          <Text style={{ flex: 1, textAlign: 'right', color: COLORS.textMuted, fontSize: 12 }}>
            {extras}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
