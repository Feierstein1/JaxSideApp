import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  COLORS,
  COMMENT_MAX,
  CONFIG_DEFAULTS,
  type CommentView,
  type DiscussionKind,
  type PostView,
  type ReportTarget,
} from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { timeAgo } from '@/format';
import { haptic } from '@/motion';
import { ProfileAvatar } from '@/profile/ProfileAvatar';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { Button, ErrorState, openMenu, SectionTitle } from '@/ui';
import { createComment, deleteComment, deletePost, fetchPost, markFeedsDirty } from './api';
import { sendScreened } from './screening';
import { authorName, openAuthor, PostCard, PostSkeleton } from './PostCard';
import { useGuest } from '@/auth/guest';
import { MedalIcons } from '@/profile/Medals';
import { ReportSheet } from '@/report/ReportSheet';
import { VoteControl } from './VoteControl';

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
      <View style={{ flex: 1, backgroundColor: COLORS.surfaceDark, paddingTop: 6 }}>
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
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      // D70: same dark grey as the feeds behind the white post and comment cards.
      style={{ flex: 1, backgroundColor: COLORS.surfaceDark }}
      keyboardVerticalOffset={90}
    >
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
            backgroundColor: COLORS.background,
            overflow: 'hidden',
          }}
        >
          {comments.length === 0 ? (
            <View style={{ alignItems: 'center', padding: SPACE.xl, gap: 6 }}>
              <Ionicons name="chatbubble-ellipses-outline" size={30} color={COLORS.primary} />
              <Text style={[TYPE.headline, { color: COLORS.text }]}>No comments yet</Text>
              <Text style={[TYPE.callout, { color: COLORS.textMuted, textAlign: 'center' }]}>
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
            backgroundColor: COLORS.background,
            borderTopWidth: 1,
            borderTopColor: COLORS.hairline,
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
          borderTopColor: COLORS.hairline,
          backgroundColor: COLORS.background,
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
              backgroundColor: COLORS.primarySoft,
            }}
          >
            <Ionicons name="return-down-forward" size={15} color={COLORS.primary} />
            <Text style={{ color: COLORS.primary, fontWeight: '700' }}>
              Replying to {authorName(replyTo.author)}
            </Text>
            <Ionicons name="close" size={16} color={COLORS.primary} />
          </Pressable>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: SPACE.sm }}>
          <TextInput
            accessibilityLabel="Write a comment"
            placeholder={replyTo ? 'Write a reply…' : 'Add a comment…'}
            placeholderTextColor={COLORS.placeholder}
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
              borderColor: COLORS.border,
              paddingHorizontal: 16,
              paddingTop: 11,
              paddingBottom: 11,
              fontSize: 16,
              color: COLORS.text,
              backgroundColor: COLORS.background,
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
              backgroundColor: text.trim() ? COLORS.primary : COLORS.skeletonOnLight,
              opacity: pressed ? 0.8 : 1,
            })}
          >
            {sending ? (
              <ActivityIndicator color={COLORS.onPrimary} />
            ) : (
              <Ionicons
                name="arrow-up"
                size={22}
                color={text.trim() ? COLORS.onPrimary : COLORS.textMuted}
              />
            )}
          </Pressable>
        </View>
      </View>
      <ReportSheet target={reporting} onClose={() => setReporting(undefined)} />
    </KeyboardAvoidingView>
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
        borderTopColor: COLORS.hairline,
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
          borderLeftColor: COLORS.cardBorder,
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
            <ProfileAvatar name={name} url={null} size={32} ringColor={COLORS.background} />
          </Pressable>
        ) : (
          <View
            style={{
              width: 32,
              height: 32,
              borderRadius: 16,
              backgroundColor: COLORS.skeletonOnLight,
            }}
          />
        )}
        <View style={{ flex: 1 }}>
          {visible ? (
            <Text style={[TYPE.caption, { color: COLORS.textMuted }]}>
              <Text
                style={{ fontWeight: '800', color: COLORS.text, fontSize: 14 }}
                onPress={'username' in c.author ? () => openAuthor(c.author) : undefined}
              >
                {name}
              </Text>
              {'medals' in c.author ? <MedalIcons keys={c.author.medals} size={12} /> : null}
              {`  ${timeAgo(c.createdAt)}${c.editedAt ? ' · edited' : ''}`}
            </Text>
          ) : null}
          <Text
            style={[
              TYPE.callout,
              {
                marginTop: visible ? 2 : 6,
                color: visible ? COLORS.text : COLORS.textMuted,
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
                  <Text style={{ color: COLORS.textMuted, fontWeight: '800', fontSize: 13 }}>
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
                  <Ionicons name="ellipsis-horizontal" size={18} color={COLORS.textMuted} />
                </Pressable>
              ) : null}
            </View>
          ) : null}
        </View>
      </View>
    </View>
  );
}
