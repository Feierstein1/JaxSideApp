import { useCallback, useState } from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { DARK, TOPIC_CATEGORIES, type FeedSort, type TopicView } from '@jax/shared';
import { useAuth } from '@/auth/AuthContext';
import { useGuest } from '@/auth/guest';
import { showAlert } from '@/dialog';
import { PostList } from '@/discussion/PostList';
import { fetchTopicPosts, topicActivity } from '@/topics/api';
import { Text } from '@/text';
import { TYPE } from '@/tokens';
import { Banner, FloatingButton, Segmented } from '@/ui';

/**
 * D125: one citywide topic: its title and description, then its posts from all over
 * Jacksonville (Latest / Top), and a button to post in it. A closed topic is read-only.
 */
export default function TopicScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAuth();
  const { isGuest, promptAccount } = useGuest();
  const [sort, setSort] = useState<FeedSort>('new');
  const [topic, setTopic] = useState<TopicView | null>(null);

  const load = useCallback(
    async (cursor?: string) => {
      const page = await fetchTopicPosts(id, sort, cursor);
      if (!cursor) setTopic(page.topic);
      return page;
    },
    [id, sort],
  );
  const verified = state.status === 'signedIn' && state.user.emailVerified;
  const open = topic?.status === 'open';

  function compose() {
    if (isGuest) return promptAccount('post in citywide topics');
    if (!verified) {
      showAlert('Confirm your email first', 'Enter the 6-digit code from your email in Account.', [
        { text: 'Not now', style: 'cancel' },
        { text: 'Go to Account', onPress: () => router.push('/account') },
      ]);
      return;
    }
    router.push({
      pathname: '/citywide/compose',
      params: { topicId: id, topicTitle: topic?.title ?? '' },
    });
  }

  const header = (
    <View style={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4, gap: 10 }}>
      <View style={{ gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="globe-outline" size={14} color={DARK.accent} />
          <Text
            style={[TYPE.caption, { color: DARK.accent, fontWeight: '800', letterSpacing: 0.6 }]}
          >
            {topic ? `CITYWIDE · ${TOPIC_CATEGORIES[topic.category].toUpperCase()}` : 'CITYWIDE'}
          </Text>
        </View>
        <Text accessibilityRole="header" style={TYPE.title}>
          {topic?.title ?? ' '}
        </Text>
        {topic?.description ? (
          <Text style={[TYPE.callout, { color: DARK.textMuted }]}>{topic.description}</Text>
        ) : null}
        {topic ? (
          <Text style={[TYPE.caption, { color: DARK.textMuted }]}>
            {topicActivity(topic)}
            {topic.closesAt && open
              ? ` · ends ${new Date(topic.closesAt).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                })}`
              : ''}
          </Text>
        ) : null}
      </View>
      {topic && !open ? (
        <Banner icon="lock-closed-outline" style={{ marginBottom: 0 }}>
          This topic is closed. You can still read it.
        </Banner>
      ) : null}
      <Segmented
        options={[
          { key: 'new', label: 'Latest', icon: 'time-outline' },
          { key: 'top', label: 'Top', icon: 'trending-up' },
        ]}
        value={sort}
        onChange={(v) => setSort(v as FeedSort)}
      />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: DARK.page }}>
      <PostList
        load={load}
        reloadKey={`${id}:${sort}`}
        onOpen={(p) => router.push(`/citywide/post/${p.id}`)}
        header={header}
        emptyIcon="chatbubbles-outline"
        emptyTitle="No posts in this topic yet"
        emptyBody={
          open
            ? 'Start the conversation. Everyone in Jacksonville can join.'
            : 'Nothing was posted.'
        }
        emptyAction={open ? { label: 'Write the first post', onPress: compose } : undefined}
        fab={open ? <FloatingButton label="Post in this topic" onPress={compose} /> : undefined}
      />
    </View>
  );
}
