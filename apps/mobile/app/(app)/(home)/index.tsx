import { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { COLORS, type FeedSort } from '@jax/shared';
import { useAuth } from '@/auth/AuthContext';
import { useGuest } from '@/auth/guest';
import { fetchFeed } from '@/discussion/api';
import { AreaLabel } from '@/location/AreaLabel';
import { PostList } from '@/discussion/PostList';
import { FloatingButton, Segmented, styles } from '@/ui';

/** P3.11: the default landing screen, the feed for the area around you. */
export default function HomeFeed() {
  const { state } = useAuth();
  const [sort, setSort] = useState<FeedSort>('new');
  const [area, setArea] = useState<string | null>(null);
  const load = useCallback(
    async (cursor?: string) => {
      const page = await fetchFeed(sort, cursor);
      if (!cursor) setArea(page.area ?? null); // D72: refreshed with the first page
      return page;
    },
    [sort],
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
      </View>
      <PostList
        load={load}
        reloadKey={sort}
        onOpen={(p) => router.push(`/post/${p.id}`)}
        emptyTitle="No posts in this area yet. Start the conversation!"
        emptyAction={{ label: 'Start a new post', onPress: compose }}
      />
      <FloatingButton label="Write a new post" onPress={compose} />
    </View>
  );
}
