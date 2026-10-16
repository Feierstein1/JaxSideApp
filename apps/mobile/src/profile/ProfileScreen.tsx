import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { BRAND, COLORS, type PostView, type PublicProfile } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { useGuest } from '@/auth/guest';
import { PostCard } from '@/discussion/PostCard';
import { getFreshReading } from '@/location/device';
import { ReportSheet } from '@/report/ReportSheet';
import { MedalList } from './Medals';
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
          backgroundColor: COLORS.surfaceInverse,
          borderBottomWidth: 4,
          borderBottomColor: BRAND.gold,
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: COLORS.primary,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 3,
            borderColor: BRAND.gold,
          }}
        >
          <Text style={{ color: COLORS.onPrimary, fontSize: 30, fontWeight: '700' }}>
            {profile.username.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text
          style={{ color: COLORS.onSurfaceInverse, fontSize: 22, fontWeight: '700', marginTop: 10 }}
        >
          {profile.username}
        </Text>
        <Text style={{ color: BRAND.gold, marginTop: 2 }}>
          Joined {joined} · {plural(profile.postCount, 'post')}
        </Text>
      </View>
      <View style={{ padding: 16 }}>
        <Text style={[styles.body, !profile.bio && styles.muted]}>
          {profile.bio || 'No bio yet.'}
        </Text>
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
