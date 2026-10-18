import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { COLORS, profileColor, type PostView, type PublicProfile } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { useGuest } from '@/auth/guest';
import { PostCard, PostSkeleton } from '@/discussion/PostCard';
import { getFreshReading } from '@/location/device';
import { ReportSheet } from '@/report/ReportSheet';
import { MedalIcons, MedalList } from './Medals';
import { ProfileAvatar } from './ProfileAvatar';
import { plural } from '@/format';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { Button, EmptyState, ErrorState, openMenu, SectionTitle, styles } from '@/ui';

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
      <View style={{ flex: 1, backgroundColor: COLORS.surfaceDark, paddingTop: SPACE.sm }}>
        {error ? <ErrorState dark message={error} onRetry={() => void load()} /> : <PostSkeleton />}
      </View>
    );
  }

  // D69: the person's own account color.
  const color = profileColor(profile.color);
  const joined = new Date(profile.joinedAt).toLocaleDateString('en-US', {
    month: 'long',
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
      style={{ backgroundColor: COLORS.surfaceDark }}
      contentContainerStyle={{ paddingBottom: SPACE.xxl }}
    >
      <View
        style={{
          alignItems: 'center',
          paddingTop: SPACE.xl,
          paddingBottom: SPACE.xl - 4,
          paddingHorizontal: SPACE.lg,
          backgroundColor: color.hex,
          borderBottomLeftRadius: RADIUS.xl,
          borderBottomRightRadius: RADIUS.xl,
        }}
      >
        {canAct ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="More options"
            onPress={menu}
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 44,
              height: 44,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="ellipsis-horizontal-circle-outline" size={28} color={color.text} />
          </Pressable>
        ) : null}
        <ProfileAvatar
          name={profile.username}
          url={profile.avatarUrl}
          size={92}
          ringColor={color.text}
        />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
          <Text style={{ color: color.text, fontSize: 24, fontWeight: '900' }}>
            {profile.username}
          </Text>
          <MedalIcons keys={profile.medals.map((m) => m.key)} color={color.text} size={16} />
        </View>
        <Text style={{ color: color.text, marginTop: 2, fontWeight: '600' }}>
          Joined {joined} · {plural(profile.postCount, 'post')}
        </Text>
        {profile.blockedByMe ? (
          <View style={{ alignSelf: 'stretch', marginTop: SPACE.md }}>
            <Button
              variant="secondary"
              title="Unblock"
              icon="lock-open-outline"
              busy={busy}
              onPress={() => void setBlocked(false)}
            />
          </View>
        ) : null}
      </View>

      <View style={{ paddingHorizontal: SPACE.md }}>
        {error ? <ErrorState dark message={error} /> : null}
        <View style={card}>
          <Text style={[TYPE.overline, { color: COLORS.textMuted, marginBottom: 6 }]}>About</Text>
          <Text style={[styles.body, !profile.bio && styles.muted]}>
            {profile.bio || 'No bio yet.'}
          </Text>
        </View>
        <View style={card}>
          <Text style={[TYPE.overline, { color: COLORS.textMuted, marginBottom: 10 }]}>Medals</Text>
          <MedalList medals={profile.medals} />
        </View>
      </View>
      <SectionTitle dark>Recent posts nearby</SectionTitle>
      {posts.length === 0 ? (
        <EmptyState dark icon="newspaper-outline" title="Nothing in your area yet" />
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

const card = {
  marginTop: SPACE.md,
  padding: SPACE.lg,
  borderRadius: RADIUS.lg,
  backgroundColor: COLORS.background,
} as const;
