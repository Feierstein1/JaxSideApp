import { social } from '@/social/api';
import { refreshUnread } from '@/social/unread';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { COLORS, profileColor, type PostView, type PublicProfile } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { useGuest } from '@/auth/guest';
import { PostCard } from '@/discussion/PostCard';
import { getFreshReading } from '@/location/device';
import { ReportSheet } from '@/report/ReportSheet';
import { MedalList } from './Medals';
import { ProfileAvatar } from './ProfileAvatar';
import { plural } from '@/format';
import { Button, styles } from '@/ui';

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
    return error ? (
      <View style={styles.screen}>
        <Text style={styles.error}>{error}</Text>
        <Button variant="link" title="Try again" onPress={() => void load()} />
      </View>
    ) : (
      <ActivityIndicator style={{ marginTop: 32 }} color={COLORS.primary} />
    );
  }

  // D69: the person's own account color.
  const color = profileColor(profile.color);
  const joined = new Date(profile.joinedAt).toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <ScrollView style={{ backgroundColor: COLORS.surfaceMuted }}>
      <View
        style={{
          alignItems: 'center',
          padding: 20,
          backgroundColor: color.hex,
        }}
      >
        <ProfileAvatar name={profile.username} url={profile.avatarUrl} ringColor={color.text} />
        <Text style={{ color: color.text, fontSize: 22, fontWeight: '800', marginTop: 10 }}>
          {profile.username}
        </Text>
        <Text style={{ color: color.text, marginTop: 2 }}>
          Joined {joined} · {plural(profile.postCount, 'post')}
        </Text>
      </View>
      <View style={{ padding: 16 }}>
        <Text style={[styles.body, !profile.bio && styles.muted]}>
          {profile.bio || 'No bio yet.'}
        </Text>
        {!profile.isMe && !isGuest && !profile.blockedByMe ? (
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
        {!profile.isMe && !isGuest ? (
          profile.blockedByMe ? (
            <Button
              variant="secondary"
              title="Unblock"
              busy={busy}
              onPress={() => void setBlocked(false)}
            />
          ) : (
            <Button variant="link" title="Block" onPress={confirmBlock} />
          )
        ) : null}
        {!profile.isMe && !isGuest ? (
          <Button variant="link" title="Report profile" onPress={() => setReporting(true)} />
        ) : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
        <Text style={[styles.label, { marginTop: 12 }]}>Medals</Text>
        <MedalList medals={profile.medals} />
        <Text style={[styles.label, { marginTop: 12 }]}>Recent posts nearby</Text>
        {posts.length === 0 ? <Text style={styles.muted}>Nothing in your area yet.</Text> : null}
      </View>
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

/** D76: the friend button's four states. */
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
  switch (profile.friendship) {
    case 'friends':
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <Text style={[styles.body, { fontWeight: '700' }]}>✓ Friends</Text>
          <Button variant="link" title="Remove friend" onPress={onRemove} />
        </View>
      );
    case 'requested':
      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 }}>
          <Text style={styles.muted}>Friend request sent</Text>
          <Button variant="link" title="Cancel" onPress={onCancel} />
        </View>
      );
    case 'incoming':
      return (
        <View style={{ marginTop: 12 }}>
          <Text style={styles.body}>{profile.username} wants to be friends.</Text>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Button title="Accept" busy={busy} onPress={onAccept} />
            <Button variant="link" title="Decline" onPress={onDecline} />
          </View>
        </View>
      );
    default:
      return <Button title="Add friend" busy={busy} onPress={onAdd} />;
  }
}
