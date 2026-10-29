import { useCallback, useState } from 'react';
import { Pressable, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { DARK, profileColor, type NotificationView } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { timeAgo } from '@/format';
import { haptic } from '@/motion';
import { social } from '@/social/api';
import { FriendRow } from '@/social/FriendRow';
import { clearUnread } from '@/social/unread';
import { OwnerAvatar } from '@/discussion/PostCard';
import { ProfileAvatar } from '@/profile/ProfileAvatar';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';
import { Bone, Button, EmptyState, ErrorState, ListGroup, PageTitle, Pulse, Screen } from '@/ui';

/** D156: what an activity notification says (never the text itself). */
function activityLine(n: NotificationView): string {
  // D157: the place's owner team is "The Owner of …", never a username.
  const name = n.actorIsOwner
    ? `The Owner${n.where ? ` of ${n.where}` : ''}`
    : (n.actor?.username ?? 'Someone');
  const near = n.where && !n.actorIsOwner ? ` near ${n.where}` : '';
  switch (n.type) {
    case 'POST_COMMENT':
      return n.count > 1
        ? `${n.count} new comments on your post${near}`
        : `${name} commented on your post${near}`;
    case 'COMMENT_REPLY':
      return `${name} replied to your comment${near}`;
    case 'MENTION':
      return `${name} mentioned you in a ${n.target?.commentId ? 'comment' : 'post'}${near}`;
    default:
      return '';
  }
}

/** D156: opens the post, scrolled to the comment (its comments show when you're nearby). */
function openTarget(n: NotificationView) {
  if (!n.target) return;
  const base =
    n.target.kind === 'business' ? `/places/post/${n.target.postId}` : `/post/${n.target.postId}`;
  router.push(n.target.commentId ? `${base}?comment=${n.target.commentId}` : base);
}

function ActivityRow({ n }: { n: NotificationView }) {
  const color = profileColor(n.actor?.color ?? 'slate');
  const icon =
    n.type === 'MENTION' ? 'at' : n.type === 'COMMENT_REPLY' ? 'return-down-forward' : 'chatbubble';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${activityLine(n)}. ${timeAgo(n.createdAt)}. Opens the post.`}
      onPress={() => openTarget(n)}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.md,
        paddingHorizontal: 14,
        paddingVertical: 10,
        minHeight: 64,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <View>
        {n.actorIsOwner ? (
          <OwnerAvatar size={44} />
        ) : (
          <ProfileAvatar
            name={n.actor?.username ?? '?'}
            url={n.actor?.avatarUrl ?? null}
            size={44}
            ringColor={color.hex}
            fill={color.hex}
          />
        )}
        <View
          style={{
            position: 'absolute',
            right: -4,
            bottom: -4,
            width: 22,
            height: 22,
            borderRadius: 11,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: DARK.accent,
            borderWidth: 2,
            borderColor: DARK.card,
          }}
        >
          <Ionicons name={icon} size={11} color={DARK.onAccent} />
        </View>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontWeight: n.read ? '600' : '800' }}>{activityLine(n)}</Text>
        <Text style={[TYPE.caption, { color: DARK.textMuted }]}>{timeAgo(n.createdAt)}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={DARK.textMuted} />
    </Pressable>
  );
}

/**
 * D76: the bell's list. Opening it marks everything read; requests can be answered here.
 * D79: dark page, requests waiting for an answer first, then everything else.
 */
export default function Notifications() {
  const [items, setItems] = useState<NotificationView[]>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();

  const load = useCallback(async () => {
    try {
      setItems((await social.notifications()).notifications);
      await social.markRead();
      clearUnread();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load notifications.');
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function answer(id: string, accept: boolean) {
    setBusy(id);
    try {
      await (accept ? social.accept(id) : social.decline(id));
      if (accept) haptic.success();
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t answer.');
    } finally {
      setBusy(undefined);
    }
  }

  const waiting = items?.filter((n) => n.actor && n.pendingRequestId) ?? [];
  const rest = items?.filter((n) => (n.actor || n.actorIsOwner) && !n.pendingRequestId) ?? [];
  const isActivity = (n: NotificationView) => n.target !== null;

  return (
    <Screen>
      <PageTitle title="Notifications" icon="notifications-outline" inline />
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!items ? (
        error ? null : (
          <Pulse>
            <View style={{ gap: 10 }}>
              {[0, 1, 2].map((i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                  <Bone w={44} h={44} r={22} />
                  <View style={{ gap: 6, flex: 1 }}>
                    <Bone w="50%" h={13} />
                    <Bone w="70%" h={11} />
                  </View>
                </View>
              ))}
            </View>
          </Pulse>
        )
      ) : waiting.length + rest.length === 0 ? (
        <EmptyState
          icon="notifications-off-outline"
          title="You’re all caught up"
          body="Comments on your posts, replies, @mentions and friend requests show up here."
        />
      ) : (
        <>
          {waiting.length ? (
            <ListGroup first title="Friend requests">
              {waiting.map((n) => (
                <FriendRow
                  key={n.id}
                  user={n.actor!}
                  subtitle={`Wants to be friends · ${timeAgo(n.createdAt)}`}
                >
                  <Button
                    size="sm"
                    title="Accept"
                    busy={busy === n.pendingRequestId}
                    onPress={() => void answer(n.pendingRequestId!, true)}
                    style={{ marginTop: 0 }}
                  />
                  <Button
                    size="sm"
                    variant="secondary"
                    title="Decline"
                    onPress={() => void answer(n.pendingRequestId!, false)}
                    style={{ marginTop: 0 }}
                  />
                </FriendRow>
              ))}
            </ListGroup>
          ) : null}
          {rest.length ? (
            <ListGroup first={!waiting.length} title="Earlier">
              {rest.map((n) =>
                isActivity(n) ? (
                  <ActivityRow key={n.id} n={n} />
                ) : (
                  <FriendRow
                    key={n.id}
                    user={n.actor!}
                    subtitle={`${n.type === 'FRIEND_REQUEST' ? 'Sent you a friend request' : 'Accepted your friend request'} · ${timeAgo(n.createdAt)}`}
                  />
                ),
              )}
            </ListGroup>
          ) : null}
        </>
      )}
    </Screen>
  );
}
