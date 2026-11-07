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
import { stopMedia } from './media-focus';
import { VideoPlayer } from './VideoPlayer';
import { VoicePlayer } from './VoicePlayer';
import { VoteControl } from './VoteControl';

type AnyAuthor =
  | { username: string }
  | { theOwner: true; place: string; staffName: string | null; avatarUrl?: string | null }
  | { guest: true }
  | { deleted: true };

export function authorName(a: AnyAuthor): string {
  if ('username' in a) return a.username;
  // D157: a place's owner team in its own discussion; never a username.
  if ('theOwner' in a) return a.staffName ? `The Owner · ${a.staffName}` : 'The Owner';
  if ('guest' in a) return 'GUEST';
  return 'deleted user';
}

/**
 * D157: The Owner's picture: the storefront on teal, like the place itself, or (D189) the
 * business login's own picture when it has one.
 */
export function OwnerAvatar({ size, url = null }: { size: number; url?: string | null }) {
  if (url) {
    return <ProfileAvatar name="The Owner" url={url} size={size} ringColor={DARK.accent} />;
  }
  return (
    <View
      accessible
      accessibilityLabel="The Owner"
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: DARK.teal,
        borderWidth: 2,
        borderColor: DARK.accent,
      }}
    >
      <Ionicons name="storefront" size={size * 0.5} color={DARK.onTeal} />
    </View>
  );
}

/** D157: the "Verified owner" pill next to The Owner's name. */
export function OwnerPill() {
  return (
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
      <Text style={{ color: DARK.onAccent, fontSize: 11, fontWeight: '800' }}>Verified</Text>
    </View>
  );
}

/** Opens a registered author's profile (P4.8); guests and deleted users aren't links. */
export function openAuthor(a: AnyAuthor) {
  if ('username' in a) router.push(`/user/${encodeURIComponent(a.username)}`);
}

/** D217: a post longer than this many lines is cut short with "Continue reading". */
const CLAMP = 3;
/** D79: a post this well received gets a small "Popular" tag. */
const POPULAR = 10;
/** D140: posts from the last 24 hours get a NEW tag on the name's line, far right. */
const NEW_FOR_MS = 24 * 3_600_000;

/**
 * A post (D69, D79): a dark card with a thick stripe down the left in the author's
 * account color (the same stripe idea as place cards). Top row: photo ringed in that
 * color, username (★ on your own, medals), and "5 min ago · 120 yd" under it. Then the
 * text, voice clip or photos, and a row of pill buttons: votes and comments. The color,
 * name and photo are the author's current ones, so changes show on all posts. In the feed
 * long posts stop after 3 lines with "Continue reading" (and "Hide text" to fold them again).
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
  // D217: how many lines the whole text needs (measured by a hidden copy), and if it is opened.
  const [totalLines, setTotalLines] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const clamped = !full && totalLines > CLAMP;
  const faint = contrastRatio(color.hex, DARK.card) < 2;
  const isUser = 'username' in author;
  const isOwner = 'theOwner' in author; // D157
  const isNew = Date.now() - Date.parse(post.createdAt) < NEW_FOR_MS;
  // D155: staff posts get a gold-tinted card with a gold edge, so they can't be mistaken.
  const isAdmin = 'admin' in author && !!author.admin;
  const meta = [
    postTime(post.createdAt),
    post.distanceMeters !== null ? formatDistance(post.distanceMeters) : null,
    post.editedAt ? 'edited' : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const bodyStyle = { fontSize: full ? 17 : 16, lineHeight: full ? 26 : 24 };

  return (
    <Pressable
      accessibilityRole={onOpen ? 'button' : undefined}
      accessibilityLabel={`Post by ${name}${post.isMine ? ' (you)' : ''}, ${meta}. ${post.voice ? 'Voice post. ' : ''}${post.body}`}
      onPress={() => {
        stopMedia(); // D203: the post opens on its own page; nothing keeps playing
        onOpen?.();
      }}
      disabled={!onOpen}
      style={{ marginHorizontal: SPACE.md, marginVertical: 6 }}
    >
      {({ pressed }) => (
        // D127: the top corners clipped like the icon's stepped frame.
        <DecoBox
          shape="chamferTop"
          cut={14}
          fill={
            pressed ? DARK.raised : isAdmin ? DARK.adminCard : isOwner ? DARK.tealSoft : DARK.card
          }
          // D200: The Owner's posts get a teal-tinted card with a teal edge, like staff's gold.
          stroke={isAdmin ? DARK.adminEdge : isOwner ? DARK.accent : undefined}
          strokeWidth={isAdmin || isOwner ? 1.5 : 1}
        >
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
                {isOwner ? (
                  <OwnerAvatar size={42} url={author.avatarUrl} />
                ) : (
                  <ProfileAvatar
                    name={name}
                    url={'avatarUrl' in author ? author.avatarUrl : null}
                    size={42}
                    ringColor={faint ? DARK.border : color.hex}
                    fill={color.hex}
                  />
                )}
              </Pressable>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontSize: 16,
                      fontWeight: '800',
                      flexShrink: 1,
                      letterSpacing: -0.2,
                      ...(isOwner ? { color: DARK.tealText } : {}),
                    }}
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
                  {isNew ? (
                    // D140 / D199: on the name's line, at the far right.
                    <View
                      accessible
                      accessibilityLabel="New, posted in the last day"
                      style={{
                        marginLeft: 'auto',
                        paddingHorizontal: 6,
                        height: 18,
                        borderRadius: 3,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: DARK.accent,
                      }}
                    >
                      <Text
                        style={{
                          color: DARK.onAccent,
                          fontSize: 10,
                          fontWeight: '800',
                          letterSpacing: 1,
                          lineHeight: 12,
                          textAlign: 'center',
                          textAlignVertical: 'center',
                          includeFontPadding: false,
                        }}
                      >
                        NEW
                      </Text>
                    </View>
                  ) : null}
                </View>
                {/* D157 / D199: the place's owner team, "Verified" under The Owner's name. */}
                {isOwner ? (
                  <View style={{ flexDirection: 'row', marginTop: 3 }}>
                    <OwnerPill />
                  </View>
                ) : null}
                {isAdmin ? <AdminTag /> : null}
                {/* D200: medals sit on the second line, with the time, so the name keeps its room. */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 1 }}>
                  {'medals' in author && author.medals.length ? (
                    <MedalIcons medals={author.medals} size={16} />
                  ) : null}
                  <Text
                    style={{
                      color: DARK.textMuted,
                      fontSize: 13,
                      fontWeight: '500',
                      flexShrink: 1,
                    }}
                  >
                    {meta}
                  </Text>
                </View>
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
              <View style={{ marginTop: SPACE.md }}>
                {/* Hidden copy that is never cut short: tells us how many lines the text needs. */}
                {!full ? (
                  <Text
                    aria-hidden
                    importantForAccessibility="no-hide-descendants"
                    pointerEvents="none"
                    style={[bodyStyle, { position: 'absolute', left: 0, right: 0, opacity: 0 }]}
                    onTextLayout={(e) => setTotalLines(e.nativeEvent.lines.length)}
                  >
                    {post.body}
                  </Text>
                ) : null}
                <Text style={bodyStyle} numberOfLines={full || expanded ? undefined : CLAMP}>
                  {post.body}
                </Text>
              </View>
            ) : null}
            {clamped ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={expanded ? 'Hide text' : 'Continue reading'}
                onPress={() => setExpanded((v) => !v)}
                hitSlop={8}
                style={{ alignSelf: 'flex-start', marginTop: 4 }}
              >
                <Text style={{ color: DARK.accent, fontWeight: '700' }}>
                  {expanded ? 'Hide text' : 'Continue reading'}
                </Text>
              </Pressable>
            ) : null}
            {/* D75: voice posts play right in the card. */}
            {post.voice ? (
              <View style={{ marginTop: SPACE.md }}>
                <VoicePlayer voice={post.voice} mediaKey={post.id} />
              </View>
            ) : null}
            {/* D102: plays when tapped (nothing loads while scrolling). */}
            {post.video ? (
              <View style={{ marginTop: SPACE.md }}>
                <VideoPlayer video={post.video} mediaKey={post.id} />
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
                onPress={() => {
                  stopMedia();
                  onOpen?.();
                }}
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
              {/* D145: the photo count moved above the photos (it overflowed the card here). */}
            </View>
          </View>
        </DecoBox>
      )}
    </Pressable>
  );
}

/** A small "what's in it" tag at the right of the action row. */
function Kind({ icon, label }: { icon: 'mic' | 'videocam'; label: string }) {
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
