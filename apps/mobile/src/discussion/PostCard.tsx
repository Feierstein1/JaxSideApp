import { Pressable, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BRAND, COLORS, type PostView } from '@jax/shared';
import { formatDistance, timeAgo } from '@/format';
import { VoteControl } from './VoteControl';

export function authorName(a: PostView['author'] | { guest: true }): string {
  if ('username' in a) return a.username;
  if ('guest' in a) return 'GUEST';
  return 'deleted user';
}

/** Round initial badge: teal for area posts, gold for business rooms (D33). */
export function Avatar({ name, business }: { name: string; business?: boolean }) {
  return (
    <View
      style={{
        width: 34,
        height: 34,
        borderRadius: 17,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: business ? BRAND.gold : COLORS.primary,
      }}
    >
      <Text style={{ color: business ? COLORS.onAccent : COLORS.onPrimary, fontWeight: '700' }}>
        {name.charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

/**
 * A post in a list (P3.11). White card, colored accent stripe (teal = area feed,
 * gold = business room), author and time, body, votes and comment count.
 */
export function PostCard({
  post,
  onOpen,
  onError,
  full = false,
}: {
  post: PostView;
  onOpen?: () => void;
  onError?: (m: string) => void;
  full?: boolean;
}) {
  const business = post.kind === 'business';
  const name = authorName(post.author);
  const meta = [
    timeAgo(post.createdAt),
    post.editedAt ? 'edited' : null,
    post.distanceMeters !== null ? formatDistance(post.distanceMeters) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      accessibilityRole={onOpen ? 'button' : undefined}
      accessibilityLabel={`Post by ${name}. ${post.body}`}
      onPress={onOpen}
      disabled={!onOpen}
      style={({ pressed }) => ({
        backgroundColor: COLORS.background,
        marginHorizontal: 12,
        marginVertical: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: COLORS.cardBorder,
        borderLeftWidth: 4,
        borderLeftColor: business ? BRAND.gold : COLORS.primary,
        padding: 14,
        opacity: pressed ? 0.9 : 1,
        shadowColor: COLORS.shadow,
        shadowOpacity: 0.06,
        shadowRadius: 6,
        shadowOffset: { width: 0, height: 2 },
        elevation: 1,
      })}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <Avatar name={name} business={business} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontWeight: '700', color: COLORS.text }}>
            {name}
            {post.isMine ? (
              <Text style={{ color: COLORS.textMuted, fontWeight: '400' }}> (you)</Text>
            ) : null}
          </Text>
          <Text style={{ color: COLORS.textMuted, fontSize: 12 }}>{meta}</Text>
        </View>
      </View>
      {/* Plain text only (P3.10): user content is never rendered as markup or auto-linked. */}
      <Text
        style={{ fontSize: 16, lineHeight: 22, color: COLORS.text }}
        numberOfLines={full ? undefined : 8}
      >
        {post.body}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 18, marginTop: 12 }}>
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
      </View>
    </Pressable>
  );
}
