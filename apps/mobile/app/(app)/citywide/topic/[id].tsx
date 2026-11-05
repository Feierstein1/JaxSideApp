import { useCallback, useState } from 'react';
import { View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import {
  DARK,
  TOPIC_CATEGORIES,
  type FeedSort,
  type ReportTarget,
  type TopicView,
} from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useGuest } from '@/auth/guest';
import { showAlert } from '@/dialog';
import { PostList } from '@/discussion/PostList';
import { ReportSheet } from '@/report/ReportSheet';
import {
  deleteTopic,
  fetchTopicPosts,
  setFollow,
  setShowCreator,
  topicActivity,
} from '@/topics/api';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';
import { Banner, Button, FloatingButton, IconButton, Segmented, openMenu } from '@/ui';

/**
 * D125 / D133: one topic (city, or near me): its title and description, Follow and a menu
 * to report it (D134: for its creator, show/hide their name or delete it), then its posts (Latest / Top), and + to post in it. Closed: read-only.
 */
export default function TopicScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { state } = useAuth();
  const { isGuest, promptAccount } = useGuest();
  const [sort, setSort] = useState<FeedSort>('new');
  const [topic, setTopic] = useState<TopicView | null>(null);
  const [reporting, setReporting] = useState<ReportTarget>();
  const [followBusy, setFollowBusy] = useState(false);

  // D134: the creator's only change: show or hide their username.
  async function toggleShowCreator() {
    if (!topic) return;
    try {
      setTopic(await setShowCreator(topic.id, !topic.showCreator));
    } catch (e) {
      showAlert('Couldn’t update', e instanceof ApiRequestError ? e.message : 'Try again.');
    }
  }

  // D134: deleting hides it for everyone right away; it can't be undone.
  function confirmDelete() {
    if (!topic) return;
    showAlert(
      'Delete this topic?',
      'It disappears for everyone right away, along with the posts in it. This can’t be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: () =>
            void deleteTopic(topic.id).then(
              () => router.back(),
              (e) =>
                showAlert(
                  'Couldn’t delete',
                  e instanceof ApiRequestError ? e.message : 'Try again.',
                ),
            ),
        },
      ],
    );
  }

  async function toggleFollow() {
    if (!topic) return;
    if (isGuest) return promptAccount('follow topics');
    setFollowBusy(true);
    try {
      const r = await setFollow(topic.id, !topic.following);
      setTopic({ ...topic, ...r });
    } catch (e) {
      showAlert('Couldn’t update', e instanceof ApiRequestError ? e.message : 'Try again.');
    } finally {
      setFollowBusy(false);
    }
  }

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
    if (isGuest) return promptAccount('post in topics');
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
          <Ionicons
            name={topic?.scope === 'local' ? 'navigate' : 'globe-outline'}
            size={14}
            color={DARK.accent}
          />
          <Text
            style={[TYPE.caption, { color: DARK.accent, fontWeight: '800', letterSpacing: 0.6 }]}
          >
            {topic
              ? `${topic.scope === 'local' ? 'NEAR YOU' : 'CITY'} · ${TOPIC_CATEGORIES[topic.category].toUpperCase()}`
              : 'TOPIC'}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
          <Text accessibilityRole="header" style={[TYPE.title, { flex: 1 }]}>
            {topic?.title ?? ' '}
          </Text>
          {topic?.isMine ? (
            <Ionicons
              name="star"
              size={18}
              color={DARK.accent}
              accessibilityLabel="You started this"
              style={{ marginTop: 4 }}
            />
          ) : null}
        </View>
        {topic?.creator ? (
          <Text style={[TYPE.caption, { color: DARK.textMuted }]}>by @{topic.creator}</Text>
        ) : null}
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
      {topic ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
          <Button
            size="sm"
            variant={topic.following ? 'secondary' : 'primary'}
            icon={topic.following ? 'checkmark' : 'add'}
            title={`${topic.following ? 'Following' : 'Follow'} · ${topic.followerCount}`}
            onPress={() => void toggleFollow()}
            busy={followBusy}
            style={{ marginTop: 0 }}
          />
          <View style={{ flex: 1 }} />
          <IconButton
            icon="ellipsis-horizontal"
            label="More options"
            size={36}
            onPress={() =>
              openMenu(
                'Topic',
                topic.isMine
                  ? [
                      {
                        label: topic.showCreator
                          ? 'Hide my name as the creator'
                          : 'Show my name as the creator',
                        icon: topic.showCreator ? 'eye-off-outline' : 'person-outline',
                        onPress: () => void toggleShowCreator(),
                      },
                      {
                        label: 'Delete this topic',
                        icon: 'trash-outline',
                        destructive: true,
                        onPress: confirmDelete,
                      },
                    ]
                  : [
                      {
                        label: 'Report this topic',
                        icon: 'flag-outline',
                        destructive: true,
                        onPress: () => setReporting({ type: 'topic', id: topic.id }),
                      },
                    ],
              )
            }
          />
        </View>
      ) : null}
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
        adContext={{ kind: 'topic', id }} // D206
        onOpen={(p) => router.push(`/citywide/post/${p.id}`)}
        header={header}
        emptyIcon="chatbubbles-outline"
        emptyTitle="No posts in this topic yet"
        emptyBody={
          open
            ? topic?.scope === 'local'
              ? 'Start the conversation. People within half a mile can join.'
              : 'Start the conversation. Everyone in Jacksonville can join.'
            : 'Nothing was posted.'
        }
        emptyAction={open ? { label: 'Write the first post', onPress: compose } : undefined}
        fab={
          open ? (
            <FloatingButton title="Add Post" label="Post in this topic" onPress={compose} />
          ) : undefined
        }
      />
      <ReportSheet target={reporting} onClose={() => setReporting(undefined)} />
    </View>
  );
}
