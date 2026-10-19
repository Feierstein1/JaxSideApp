import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { profileColor, type PostView, type PublicProfile, DARK } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { useGuest } from '@/auth/guest';
import { PostCard, PostSkeleton } from '@/discussion/PostCard';
import { getFreshReading } from '@/location/device';
import { ReportSheet } from '@/report/ReportSheet';
import { social } from '@/social/api';
import { refreshUnread } from '@/social/unread';
import { MedalIcons, MedalList } from './Medals';
import { ProfileAvatar } from './ProfileAvatar';

import { RADIUS, SPACE, TYPE } from '@/tokens';
import { Button, EmptyState, ErrorState, openMenu, SectionTitle, StatTile } from '@/ui';
import { Text } from '@/text';

/** P4.8: someone's public profile and recent area posts, with Block (P5.2). */
export function ProfileScreen({ username, postPath }: { username: string; postPath: string }) {
  const { isGuest } = useGuest();
  const [profile, setProfile] = useState<PublicProfile>();
  const [posts, setPosts] = useState<PostView[]>([]);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState(false);

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const reading = await getFreshReading();
      const res = await api.post<{ profile: PublicProfile; posts: PostView[] }>(
        `/api/v1/users/${encodeURIComponent(username)}`,
        { reading },
      );
      setProfile(res.profile);
      setPosts(res.posts);
    } catch (e) {
      setError(
        e instanceof ApiRequestError && e.status === 404
          ? 'This profile isn’t available.'
          : e instanceof ApiRequestError
            ? e.message
            : 'Couldn’t load this profile.',
      );
    }
  }, [username]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setBlocked(blocked: boolean) {
    setBusy(true);
    try {
      const path = `/api/v1/users/${encodeURIComponent(username)}/block`;
      if (blocked) await api.put(path);
      else await api.delete(path);
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t save.');
    } finally {
      setBusy(false);
    }
  }

  /** D76: friend requests from a profile. */
  async function friendAction(action: () => Promise<unknown>) {
    setBusy(true);
    setError(undefined);
    try {
      await action();
      await load();
      void refreshUnread();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t save.');
    } finally {
      setBusy(false);
    }
  }

  function confirmUnfriend() {
    Alert.alert(`Remove ${username} as a friend?`, 'You can send a new request later.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => void friendAction(() => social.unfriend(username)),
      },
    ]);
  }

  function confirmBlock() {
    Alert.alert(
      `Block ${username}?`,
      'You won’t see their posts or comments, and they can’t see your profile. They aren’t told.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Block', style: 'destructive', onPress: () => void setBlocked(true) },
      ],
    );
  }

  if (!profile) {
    return (
      <View style={{ flex: 1, backgroundColor: DARK.page, paddingTop: SPACE.sm }}>
        {error ? <ErrorState message={error} onRetry={() => void load()} /> : <PostSkeleton />}
      </View>
    );
  }

  // D69: the person's own account color.
  const color = profileColor(profile.color);
  const joined = new Date(profile.joinedAt).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
  });
  const canAct = !profile.isMe && !isGuest;
  const menu = () =>
    openMenu(profile.username, [
      profile.blockedByMe
        ? { label: 'Unblock', onPress: () => void setBlocked(false) }
        : { label: 'Block', destructive: true, onPress: confirmBlock },
      { label: 'Report profile', destructive: true, onPress: () => setReporting(true) },
    ]);

  return (
    <ScrollView
      style={{ backgroundColor: DARK.page }}
      contentContainerStyle={{ paddingTop: SPACE.md, paddingBottom: 56 }}
    >
      {/* D79: the same profile card as Account: color band, photo, name, stats. */}
      <View
        style={{
          marginHorizontal: SPACE.md,
          borderRadius: RADIUS.lg + 4,
          overflow: 'hidden',
          backgroundColor: DARK.card,
        }}
      >
        <View style={{ height: 64, backgroundColor: color.hex }} />
        {canAct ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More options"
            onPress={menu}
            style={{
              position: 'absolute',
              top: 10,
              right: 10,
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: DARK.bar,
            }}
          >
            <Ionicons name="ellipsis-horizontal" size={20} color={DARK.text} />
          </Pressable>
        ) : null}
        <View style={{ paddingHorizontal: SPACE.lg, paddingBottom: SPACE.lg, marginTop: -44 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.md }}>
            <View style={{ borderRadius: 50, backgroundColor: DARK.card, padding: 4 }}>
              <ProfileAvatar
                name={profile.username}
                url={profile.avatarUrl}
                size={88}
                ringColor={color.hex}
                fill={color.hex}
              />
            </View>
            <View style={{ flex: 1, paddingBottom: 6 }}>
              <Text
                numberOfLines={1}
                style={{ fontSize: 24, fontWeight: '800', letterSpacing: -0.5 }}
              >
                {profile.username}
              </Text>
              {profile.medals.length ? (
                <MedalIcons keys={profile.medals.map((m) => m.key)} color={DARK.accent} size={15} />
              ) : null}
            </View>
          </View>
          <Text
            style={[TYPE.body, { marginTop: SPACE.md }, !profile.bio && { color: DARK.textMuted }]}
          >
            {profile.bio || 'No bio yet.'}
          </Text>
          <View style={{ flexDirection: 'row', gap: SPACE.sm, marginTop: SPACE.lg }}>
            <StatTile
              icon="create"
              value={String(profile.postCount)}
              label={profile.postCount === 1 ? 'Post' : 'Posts'}
            />
            <StatTile
              icon="ribbon"
              value={String(profile.medals.length)}
              label={profile.medals.length === 1 ? 'Medal' : 'Medals'}
            />
            <StatTile icon="calendar" value={joined} label="Joined" color={DARK.tealText} />
          </View>
          {canAct && !profile.blockedByMe ? (
            <FriendButton
              profile={profile}
              busy={busy}
              onAdd={() => void friendAction(() => social.send(profile.username))}
              onCancel={() => void friendAction(() => social.cancel(profile.friendRequestId!))}
              onAccept={() => void friendAction(() => social.accept(profile.friendRequestId!))}
              onDecline={() => void friendAction(() => social.decline(profile.friendRequestId!))}
              onRemove={confirmUnfriend}
            />
          ) : null}
          {profile.blockedByMe ? (
            <Button
              variant="secondary"
              title="Unblock"
              icon="lock-open-outline"
              busy={busy}
              onPress={() => void setBlocked(false)}
              style={{ marginTop: SPACE.md }}
            />
          ) : null}
        </View>
      </View>

      {error ? <ErrorState message={error} /> : null}
      {profile.medals.length ? (
        <>
          <SectionTitle>Medals</SectionTitle>
          <View
            style={{
              marginHorizontal: SPACE.md,
              padding: SPACE.lg,
              borderRadius: RADIUS.lg,
              backgroundColor: DARK.card,
            }}
          >
            <MedalList medals={profile.medals} />
          </View>
        </>
      ) : null}
      <SectionTitle>Recent posts nearby</SectionTitle>
      {posts.length === 0 ? (
        <EmptyState icon="newspaper-outline" title="Nothing in your area yet" />
      ) : null}
      {posts.map((p) => (
        <PostCard key={p.id} post={p} onOpen={() => router.push(`${postPath}/${p.id}` as never)} />
      ))}
      <ReportSheet
        target={reporting ? { type: 'user', username: profile.username } : undefined}
        onClose={() => setReporting(false)}
      />
    </ScrollView>
  );
}

/**
 * D76 / D79: the friend button's four states, full width under the profile card:
 * - not friends: gold "Add friend";
 * - request sent: grey "Request sent", tap to cancel;
 * - they asked you: "wants to be friends" with Accept and Decline side by side;
 * - friends: teal "Friends ▾", which opens "Remove friend" (kept out of the ··· menu so
 *   that menu fits Android's three-button dialogs).
 */
function FriendButton({
  profile,
  busy,
  onAdd,
  onCancel,
  onAccept,
  onDecline,
  onRemove,
}: {
  profile: PublicProfile;
  busy: boolean;
  onAdd: () => void;
  onCancel: () => void;
  onAccept: () => void;
  onDecline: () => void;
  onRemove: () => void;
}) {
  const top = { marginTop: SPACE.md };
  switch (profile.friendship) {
    case 'friends':
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Friends with ${profile.username}. More options`}
          onPress={() =>
            openMenu(profile.username, [
              { label: 'Remove friend', destructive: true, onPress: onRemove },
            ])
          }
          style={({ pressed }) => [
            top,
            {
              minHeight: 48,
              borderRadius: RADIUS.md + 2,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              backgroundColor: DARK.tealSoft,
              borderWidth: 1,
              borderColor: DARK.tealText,
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Ionicons name="people" size={18} color={DARK.tealText} />
          <Text style={{ color: DARK.tealText, fontWeight: '800', fontSize: 15.5 }}>Friends</Text>
          <Ionicons name="chevron-down" size={16} color={DARK.tealText} />
        </Pressable>
      );
    case 'requested':
      return (
        <Button
          variant="secondary"
          title="Request sent · tap to cancel"
          icon="time-outline"
          busy={busy}
          onPress={onCancel}
          style={top}
        />
      );
    case 'incoming':
      return (
        <View
          style={[
            top,
            {
              padding: SPACE.md,
              borderRadius: RADIUS.md + 2,
              backgroundColor: DARK.accentSoft,
              gap: SPACE.sm,
            },
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="person-add" size={16} color={DARK.accent} />
            <Text style={[TYPE.callout, { flex: 1, fontWeight: '700' }]}>
              {profile.username} wants to be friends
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
            <Button
              title="Accept"
              icon="checkmark"
              busy={busy}
              onPress={onAccept}
              style={{ flex: 1, marginTop: 0 }}
            />
            <Button
              variant="secondary"
              title="Decline"
              onPress={onDecline}
              style={{ flex: 1, marginTop: 0 }}
            />
          </View>
        </View>
      );
    default:
      return (
        <Button title="Add friend" icon="person-add" busy={busy} onPress={onAdd} style={top} />
      );
  }
}
