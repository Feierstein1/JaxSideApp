import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { COLORS, type FeedSort, type PostTypeFilter } from '@jax/shared';
import { useAuth } from '@/auth/AuthContext';
import { useGuest } from '@/auth/guest';
import { fetchFeed } from '@/discussion/api';
import { AreaLabel } from '@/location/AreaLabel';
import { getFreshReading, noteListLoad, useReloadWhenMoved } from '@/location/device';
import { PostList } from '@/discussion/PostList';
import { PostTypeTabs } from '@/discussion/PostTypeTabs';
import { refreshLimiter } from '@/refresh-limit';
import { FloatingButton, RefreshButton, Segmented, styles } from '@/ui';

/** P3.11: the default landing screen, the feed for the area around you. */
export default function HomeFeed() {
  const { state } = useAuth();
  const [sort, setSort] = useState<FeedSort>('new');
  const [type, setType] = useState<PostTypeFilter>('all'); // D75
  const [area, setArea] = useState<string | null>(null);
  // D73: reload on the refresh button, or when the app is reopened somewhere new.
  const [reloads, setReloads] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const reload = () => setReloads((n) => n + 1);
  useReloadWhenMoved(reload);
  async function refresh() {
    const wait = refreshLimiter.tap(); // D74: 30 a minute
    if (wait) {
      Alert.alert('Slow down a little', `You can refresh again in ${wait} s.`);
      return;
    }
    setRefreshing(true);
    try {
      await getFreshReading({ fresh: true }); // a new fix, not the cached one
    } catch {
      // the list shows the location error
    } finally {
      setRefreshing(false);
      reload();
    }
  }
  // D74: search by username or text; waits a moment while typing, needs 2+ characters.
  const [typed, setTyped] = useState('');
  const [q, setQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(typed.trim().length >= 2 ? typed.trim() : ''), 400);
    return () => clearTimeout(t);
  }, [typed]);
  const load = useCallback(
    async (cursor?: string) => {
      const page = await fetchFeed(sort, cursor, q || undefined, type);
      if (!cursor) {
        setArea(page.area ?? null); // D72: refreshed with the first page
        noteListLoad(); // D77: where this list is from
      }
      return page;
    },
    [sort, q, type],
  );
  const verified = state.status === 'signedIn' && state.user.emailVerified;
  const { isGuest, promptAccount } = useGuest();
  const guest = state.status === 'guest' ? state.guest : undefined;

  function compose() {
    if (isGuest) return promptAccount('start a post'); // P4.2
    if (!verified) {
      Alert.alert(
        'Confirm your email first',
        'Enter the 6-digit code from your email in Account.',
        [
          { text: 'Not now', style: 'cancel' },
          { text: 'Go to Account', onPress: () => router.push('/account') },
        ],
      );
      return;
    }
    router.push('/compose');
  }

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.surfaceDark }}>
      {/* D70: a black bar under the black header, like Places, with the feed controls. */}
      <View
        style={{
          backgroundColor: COLORS.surfaceInverse,
          paddingHorizontal: 12,
          paddingTop: 4,
          paddingBottom: 12,
          gap: 8,
        }}
      >
        <AreaLabel name={area} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <TextInput
            accessibilityLabel="Search posts"
            placeholder="Search posts or @username…"
            placeholderTextColor={COLORS.placeholder}
            value={typed}
            onChangeText={setTyped}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            maxLength={50}
            style={[
              styles.input,
              { flex: 1, backgroundColor: COLORS.background, borderColor: COLORS.background },
            ]}
          />
          <RefreshButton onPress={() => void refresh()} busy={refreshing} />
        </View>
        {guest?.expiringSoon ? (
          <View style={[styles.banner, { marginBottom: 0 }]}>
            <Text style={styles.body}>
              Your guest session ends in {guest.daysLeft} {guest.daysLeft === 1 ? 'day' : 'days'}{' '}
              unless you use Jax before then.
            </Text>
          </View>
        ) : null}
        {!verified && !isGuest ? (
          <Pressable onPress={() => router.push('/account')} accessibilityRole="button">
            <View style={[styles.banner, { marginBottom: 0 }]}>
              <Text style={styles.body}>
                Confirm your email to post, comment and vote. Tap to enter your code.
              </Text>
            </View>
          </Pressable>
        ) : null}
        <View style={{ alignSelf: 'flex-start' }}>
          <Segmented
            options={[
              { key: 'new', label: 'New' },
              { key: 'top', label: 'Top this week' },
            ]}
            value={sort}
            onChange={(v) => setSort(v as FeedSort)}
          />
        </View>
        <PostTypeTabs value={type} onChange={setType} />
      </View>
      <PostList
        load={load}
        reloadKey={`${sort}:${reloads}:${q}:${type}`}
        onOpen={(p) => router.push(`/post/${p.id}`)}
        emptyTitle={
          q
            ? `No posts nearby match “${q}”.`
            : type !== 'all'
              ? `No ${type} posts nearby yet.`
              : 'No posts in this area yet. Start the conversation!'
        }
        emptyAction={q ? undefined : { label: 'Start a new post', onPress: compose }}
      />
      <FloatingButton label="Write a new post" onPress={compose} />
    </View>
  );
}
