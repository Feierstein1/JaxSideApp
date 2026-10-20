import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  COMMENT_MAX,
  CONFIG_DEFAULTS,
  type CommentView,
  type DiscussionKind,
  type PostView,
  type ReportTarget,
  DARK,
} from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { timeAgo } from '@/format';
import { haptic } from '@/motion';
import { ProfileAvatar } from '@/profile/ProfileAvatar';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { Button, ErrorState, openMenu, SectionTitle, KeyboardSafeView } from '@/ui';
import { createComment, deleteComment, deletePost, fetchPost, markFeedsDirty } from './api';
import { sendScreened } from './screening';
import { authorName, openAuthor, PostCard, PostSkeleton } from './PostCard';
import { useGuest } from '@/auth/guest';
import { MedalIcons } from '@/profile/Medals';
import { ReportSheet } from '@/report/ReportSheet';
import { VoteControl } from './VoteControl';
import { Text, TextInput } from '@/text';

const MAX_DEPTH = CONFIG_DEFAULTS['comments.maxDepth'];

/**
 * P3.3 / P3.11: one post with its comment thread and a reply box. D78: the post's actions
 * (report, delete) are in its "•••" menu; comments sit in one white panel as a thread with
 * avatars; the reply box is a rounded field with a round send button.
 */
export function PostDetail({ kind, id }: { kind: DiscussionKind; id: string }) {
  const [post, setPost] = useState<PostView>();
  const [comments, setComments] = useState<CommentView[]>([]);
  const [error, setError] = useState<string>();
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<CommentView>();
  const [sending, setSending] = useState(false);
  const { isGuest, promptAccount } = useGuest();
  const canComment = !isGuest;
  const [reporting, setReporting] = useState<ReportTarget>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      const res = await fetchPost(kind, id);
      setPost(res.post);
      setComments(res.comments);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t get your location.');
    }
  }, [kind, id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send() {
    if (!text.trim() || sending) return;
    setSending(true);
    setError(undefined);
    try {
      const sent = await sendScreened((ok) =>
        createComment(kind, id, text.trim(), replyTo?.id, ok),
      );
      if (!sent) return; // chose to edit after a warning
      haptic.success();
      setText('');
      setReplyTo(undefined);
      markFeedsDirty(); // comment count changed
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t post your comment.');
    } finally {
      setSending(false);
    }
  }

  function confirmDeletePost() {
    Alert.alert('Delete post?', 'This can’t be undone.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deletePost(kind, id);
            markFeedsDirty();
            router.back();
          } catch (e) {
            setError(e instanceof ApiRequestError ? e.message : 'Couldn’t delete.');
          }
        },
      },
    ]);
  }

  async function removeComment(c: CommentView) {
    try {
      await deleteComment(c.id);
      markFeedsDirty();
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t delete.');
    }
  }

  if (!post) {
    return (
      <View style={{ flex: 1, backgroundColor: DARK.page, paddingTop: 6 }}>
        {error ? <ErrorState dark message={error} onRetry={() => void load()} /> : <PostSkeleton />}
      </View>
    );
  }

  const postMenu = post.isMine
    ? () =>
        openMenu('Your post', [
          { label: 'Delete post', destructive: true, onPress: confirmDeletePost },
        ])
    : !isGuest
      ? () =>
          openMenu('Post', [
            {
              label: 'Report post',
              destructive: true,
              onPress: () => setReporting({ type: kind, id: post.id }),
            },
          ])
      : undefined;

  return (
    <KeyboardSafeView style={{ flex: 1, backgroundColor: DARK.page }}>
      {post.place ? <PlaceContext place={post.place} /> : null}
      <ScrollView
        contentContainerStyle={{ paddingTop: 6, paddingBottom: SPACE.xl }}
        keyboardShouldPersistTaps="handled"
      >
        <PostCard
          post={post}
          full
          onError={setError}
          onMore={postMenu}
          onReportPhoto={
            !isGuest && !post.isMine ? (id) => setReporting({ type: 'photo', id }) : undefined
          }
        />

        <SectionTitle dark>
          {comments.length === 0 ? 'Comments' : `Comments · ${comments.length}`}
        </SectionTitle>
        <View
          style={{
            marginHorizontal: SPACE.md,
            borderRadius: RADIUS.lg,
            backgroundColor: DARK.card,
            overflow: 'hidden',
          }}
        >
          {comments.length === 0 ? (
            <View style={{ alignItems: 'center', padding: SPACE.xl, gap: 6 }}>
              <Ionicons name="chatbubble-ellipses-outline" size={30} color={DARK.accent} />
              <Text style={[TYPE.headline, { color: DARK.text }]}>No comments yet</Text>
              <Text style={[TYPE.callout, { color: DARK.textMuted, textAlign: 'center' }]}>
                {canComment ? 'Start the conversation.' : 'Nobody has replied yet.'}
              </Text>
            </View>
          ) : (
            comments.map((c, i) => (
              <CommentRow
                key={c.id}
                c={c}
                first={i === 0}
                onReply={
                  canComment && c.depth < MAX_DEPTH && c.status === 'visible'
                    ? () => setReplyTo(c)
                    : undefined
                }
                onDelete={
                  c.isMine && !isGuest && c.status === 'visible'
                    ? () => void removeComment(c)
                    : undefined
                }
                onReport={
                  !isGuest && !c.isMine && c.status === 'visible'
                    ? () => setReporting({ type: 'comment', id: c.id })
                    : undefined
                }
                onError={setError}
              />
            ))
          )}
        </View>
        {error ? <ErrorState dark message={error} /> : null}
      </ScrollView>

      {!canComment ? (
        <View
          style={{
            padding: SPACE.md,
            backgroundColor: DARK.card,
            borderTopWidth: 1,
            borderTopColor: DARK.hairline,
          }}
        >
          <Button
            title="Sign up to comment"
            icon="person-add-outline"
            onPress={() => promptAccount('comment')}
            style={{ marginTop: 0 }}
          />
        </View>
      ) : null}
      <View
        style={{
          display: canComment ? 'flex' : 'none',
          borderTopWidth: 1,
          borderTopColor: DARK.hairline,
          backgroundColor: DARK.card,
          paddingHorizontal: SPACE.md,
          paddingVertical: 10,
          gap: SPACE.sm,
        }}
      >
        {replyTo ? (
          <Pressable
            onPress={() => setReplyTo(undefined)}
            accessibilityRole="button"
            accessibilityLabel={`Replying to ${authorName(replyTo.author)}. Tap to cancel.`}
            style={{
              alignSelf: 'flex-start',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              minHeight: 32,
              borderRadius: RADIUS.pill,
              backgroundColor: DARK.tealSoft,
            }}
          >
            <Ionicons name="return-down-forward" size={15} color={DARK.tealText} />
            <Text style={{ color: DARK.tealText, fontWeight: '700' }}>
              Replying to {authorName(replyTo.author)}
            </Text>
            <Ionicons name="close" size={16} color={DARK.tealText} />
          </Pressable>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.sm }}>
          <TextInput
            accessibilityLabel="Write a comment"
            placeholder={replyTo ? 'Write a reply…' : 'Add a comment…'}
            placeholderTextColor={DARK.placeholder}
            value={text}
            onChangeText={setText}
            maxLength={COMMENT_MAX}
            multiline
            style={{
              flex: 1,
              minHeight: 44,
              maxHeight: 120,
              borderRadius: 22,
              borderWidth: 1,
              borderColor: DARK.border,
              paddingHorizontal: 16,
              paddingTop: 11,
              paddingBottom: 11,
              fontSize: 16,
              backgroundColor: DARK.raised,
            }}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send comment"
            accessibilityState={{ disabled: !text.trim() || sending, busy: sending }}
            disabled={!text.trim() || sending}
            onPress={() => void send()}
            style={({ pressed }) => ({
              width: 44,
              height: 44,
              borderRadius: 22,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: text.trim() ? DARK.accent : DARK.raised,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            {sending ? (
              <ActivityIndicator color={DARK.onAccent} />
            ) : (
              <Ionicons
                name="arrow-up"
                size={22}
                color={text.trim() ? DARK.onAccent : DARK.textMuted}
              />
            )}
          </Pressable>
        </View>
      </View>
      <ReportSheet target={reporting} onClose={() => setReporting(undefined)} />
    </KeyboardSafeView>
  );
}

function CommentRow({
  c,
  first,
  onReply,
  onDelete,
  onReport,
  onError,
}: {
  c: CommentView;
  first: boolean;
  onReply?: () => void;
  onDelete?: () => void;
  onReport?: () => void;
  onError: (m: string) => void;
}) {
  const visible = c.status === 'visible';
  const name = visible ? authorName(c.author) : '';
  const menu = onDelete
    ? () =>
        openMenu('Your comment', [
          {
            label: 'Delete comment',
            destructive: true,
            onPress: () =>
              Alert.alert('Delete comment?', 'This can’t be undone.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Delete', style: 'destructive', onPress: onDelete },
              ]),
          },
        ])
    : onReport
      ? () =>
          openMenu('Comment', [{ label: 'Report comment', destructive: true, onPress: onReport }])
      : undefined;

  return (
    <View
      style={{
        borderTopWidth: first || c.depth > 0 ? 0 : 1,
        borderTopColor: DARK.hairline,
        paddingLeft: SPACE.md + c.depth * 20,
        paddingRight: SPACE.xs,
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          gap: 10,
          paddingTop: SPACE.md,
          paddingBottom: visible ? 2 : SPACE.md,
          // D78: replies hang off a thin thread line.
          borderLeftWidth: c.depth > 0 ? 2 : 0,
          borderLeftColor: DARK.hairline,
          paddingLeft: c.depth > 0 ? 10 : 0,
        }}
      >
        {visible ? (
          <Pressable
            onPress={'username' in c.author ? () => openAuthor(c.author) : undefined}
            disabled={!('username' in c.author)}
            accessibilityRole={'username' in c.author ? 'link' : undefined}
            accessibilityLabel={'username' in c.author ? `${name}'s profile` : undefined}
          >
            <ProfileAvatar name={name} url={null} size={34} ringColor={DARK.hairline} />
          </Pressable>
        ) : (
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: DARK.raised,
            }}
          />
        )}
        <View style={{ flex: 1 }}>
          {visible ? (
            <Text style={[TYPE.caption, { color: DARK.textMuted }]}>
              <Text
                style={{ fontWeight: '800', color: DARK.text, fontSize: 14 }}
                onPress={'username' in c.author ? () => openAuthor(c.author) : undefined}
              >
                {name}
              </Text>
              {'medals' in c.author ? <MedalIcons keys={c.author.medals} size={14} /> : null}
              {`  ${timeAgo(c.createdAt)}${c.editedAt ? ' · edited' : ''}`}
            </Text>
          ) : null}
          <Text
            style={[
              TYPE.callout,
              {
                marginTop: visible ? 2 : 6,
                color: visible ? DARK.text : DARK.textMuted,
                fontStyle: visible ? 'normal' : 'italic',
              },
            ]}
          >
            {visible
              ? c.body
              : c.status === 'deleted'
                ? 'This comment was deleted.'
                : 'This comment was removed.'}
          </Text>
          {visible ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: -8 }}>
              <VoteControl
                target={{ type: 'comment', id: c.id }}
                score={c.score}
                myVote={c.myVote}
                compact
                onError={onError}
              />
              {onReply ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Reply to ${name}`}
                  onPress={onReply}
                  style={{ minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' }}
                >
                  <Text style={{ color: DARK.textMuted, fontWeight: '800', fontSize: 13 }}>
                    Reply
                  </Text>
                </Pressable>
              ) : null}
              <View style={{ flex: 1 }} />
              {menu ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="More options for this comment"
                  onPress={menu}
                  style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
                >
                  <Ionicons name="ellipsis-horizontal" size={18} color={DARK.textMuted} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}

/**
 * D80: on a place's post, a strip fixed under the header names the place, so you don't lose
 * track of where you are while reading comments. Tap it to go back to the place.
 */
function PlaceContext({ place }: { place: { id: string; name: string } }) {
  function open() {
    if (router.canGoBack()) router.back();
    else router.push(`/places/${place.id}`);
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Posted in ${place.name}. Go to the place.`}
      onPress={open}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.md,
        minHeight: 56,
        paddingHorizontal: SPACE.lg,
        paddingVertical: SPACE.sm,
        backgroundColor: pressed ? DARK.raised : DARK.bar,
        borderBottomWidth: 1,
        borderBottomColor: DARK.hairline,
      })}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 11,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: DARK.accentSoft,
        }}
      >
        <Ionicons name="storefront" size={18} color={DARK.accent} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[TYPE.overline, { color: DARK.textMuted }]}>Posted in</Text>
        <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: '800' }}>
          {place.name}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={DARK.textMuted} />
    </Pressable>
  );
}
