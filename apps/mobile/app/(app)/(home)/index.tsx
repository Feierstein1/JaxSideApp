import { useCallback, useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { COLORS, type FeedSort } from '@jax/shared';
import { useAuth } from '@/auth/AuthContext';
import { useGuest } from '@/auth/guest';
import { fetchFeed } from '@/discussion/api';
import { PostList } from '@/discussion/PostList';
import { Segmented, styles } from '@/ui';

/** P3.11: the default landing screen, the feed for the area around you. */
export default function HomeFeed() {
  const { state } = useAuth();
  const [sort, setSort] = useState<FeedSort>('new');
  const load = useCallback((cursor?: string) => fetchFeed(sort, cursor), [sort]);
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
    <View style={{ flex: 1 }}>
      <PostList
        load={load}
        reloadKey={sort}
        onOpen={(p) => router.push(`/post/${p.id}`)}
        header={
          <View style={{ paddingHorizontal: 12, paddingTop: 6, gap: 8 }}>
            {guest?.expiringSoon ? (
              <View style={styles.banner}>
                <Text style={styles.body}>
                  Your guest session ends in {guest.daysLeft}{' '}
                  {guest.daysLeft === 1 ? 'day' : 'days'} unless you use Jax before then.
                </Text>
              </View>
            ) : null}
            {!verified && !isGuest ? (
              <Pressable onPress={() => router.push('/account')} accessibilityRole="button">
                <View style={styles.banner}>
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
        }
        emptyTitle="No posts in this area yet. Start the conversation!"
        emptyAction={{ label: 'Start a new post', onPress: compose }}
      />
      {/* Floating "new post" button: gold with a black plus (D33). */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Write a new post"
        onPress={compose}
        style={{
          position: 'absolute',
          right: 20,
          bottom: 24,
          width: 58,
          height: 58,
          borderRadius: 29,
          backgroundColor: COLORS.accent,
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: COLORS.shadow,
          shadowOpacity: 0.25,
          shadowRadius: 8,
          shadowOffset: { width: 0, height: 3 },
          elevation: 5,
        }}
      >
        <Ionicons name="add" size={32} color={COLORS.onAccent} />
      </Pressable>
    </View>
  );
}
