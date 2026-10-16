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
import { Button, styles } from '@/ui';
import { createComment, deleteComment, deletePost, fetchPost, markFeedsDirty } from './api';
import { authorName, openAuthor, PostCard } from './PostCard';
import { useGuest } from '@/auth/guest';
import { ReportSheet } from '@/report/ReportSheet';
import { VoteControl } from './VoteControl';

const MAX_DEPTH = CONFIG_DEFAULTS['comments.maxDepth'];

/** P3.3 / P3.11: one post with its comment thread and a reply box. */
export function PostDetail({ kind, id }: { kind: DiscussionKind; id: string }) {
  const [post, setPost] = useState<PostView>();
  const [comments, setComments] = useState<CommentView[]>([]);
  const [error, setError] = useState<string>();
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<CommentView>();
  const [sending, setSending] = useState(false);
  const { isGuest, canComment, promptAccount } = useGuest();
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
      await createComment(kind, id, text.trim(), replyTo?.id);
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
    return error ? (
      <View style={styles.screen}>
        <Text style={styles.error}>{error}</Text>
        <Button variant="link" title="Try again" onPress={() => void load()} />
      </View>
    ) : (
      <ActivityIndicator style={{ marginTop: 32 }} color={COLORS.primary} />
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1, backgroundColor: COLORS.surfaceMuted }}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        contentContainerStyle={{ paddingVertical: 6 }}
        keyboardShouldPersistTaps="handled"
      >
        <PostCard post={post} full onError={setError} />
        <View style={{ paddingHorizontal: 16, flexDirection: 'row', gap: 16 }}>
          {post.isMine ? (
            <Button variant="link" title="Delete my post" onPress={confirmDeletePost} />
          ) : (
            <Button
              variant="link"
              title="Report post"
              onPress={() => setReporting({ type: kind, id: post.id })}
            />
          )}
        </View>

        <Text style={[styles.label, { marginHorizontal: 16, marginTop: 8 }]}>
          {comments.length === 0 ? 'No comments yet. Start the conversation.' : 'Comments'}
        </Text>
        {comments.map((c) => (
          <CommentRow
            key={c.id}
            c={c}
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
              !c.isMine && c.status === 'visible'
                ? () => setReporting({ type: 'comment', id: c.id })
                : undefined
            }
            onError={setError}
          />
        ))}
        {error ? <Text style={[styles.error, { marginHorizontal: 16 }]}>{error}</Text> : null}
      </ScrollView>

      {!canComment ? (
        <View style={{ padding: 10, backgroundColor: COLORS.background }}>
          <Button title="Sign up to comment" onPress={() => promptAccount('comment')} />
        </View>
      ) : null}
      <View
        style={{
          display: canComment ? 'flex' : 'none',
          borderTopWidth: 1,
          borderTopColor: COLORS.cardBorder,
          backgroundColor: COLORS.background,
          padding: 10,
        }}
      >
        {replyTo ? (
          <Pressable onPress={() => setReplyTo(undefined)} accessibilityRole="button">
            <Text style={[styles.muted, { marginBottom: 6 }]}>
              Replying to {authorName(replyTo.author)} · tap to cancel
            </Text>
          </Pressable>
        ) : null}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
          <TextInput
            accessibilityLabel="Write a comment"
            placeholder={replyTo ? 'Write a reply…' : 'Write a comment…'}
            placeholderTextColor={COLORS.placeholder}
            value={text}
            onChangeText={setText}
            maxLength={COMMENT_MAX}
            multiline
            style={[styles.input, { flex: 1, maxHeight: 120 }]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send comment"
            disabled={!text.trim() || sending}
            onPress={() => void send()}
            style={{
              backgroundColor: text.trim() ? COLORS.primary : COLORS.border,
              borderRadius: 8,
              paddingHorizontal: 14,
              paddingVertical: 11,
            }}
          >
            {sending ? (
              <ActivityIndicator color={COLORS.onPrimary} />
            ) : (
              <Text style={{ color: COLORS.onPrimary, fontWeight: '700' }}>Send</Text>
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
  onReply,
  onDelete,
  onReport,
  onError,
}: {
  c: CommentView;
  onReply?: () => void;
  onDelete?: () => void;
  onReport?: () => void;
  onError: (m: string) => void;
}) {
  const visible = c.status === 'visible';
  return (
    <View
      style={{
        marginLeft: 12 + c.depth * 16,
        marginRight: 12,
        marginTop: 6,
        paddingLeft: c.depth > 0 ? 10 : 0,
        borderLeftWidth: c.depth > 0 ? 2 : 0,
        borderLeftColor: COLORS.cardBorder,
      }}
    >
      <View
        style={{
          backgroundColor: COLORS.background,
          borderRadius: 10,
          padding: 10,
          borderWidth: 1,
          borderColor: COLORS.cardBorder,
        }}
      >
        <Text style={{ fontSize: 13, color: COLORS.textMuted, marginBottom: 4 }}>
          <Text
            style={{ fontWeight: '700', color: COLORS.text }}
            onPress={visible && 'username' in c.author ? () => openAuthor(c.author) : undefined}
          >
            {visible ? authorName(c.author) : ' '}
          </Text>
          {visible ? ` · ${timeAgo(c.createdAt)}${c.editedAt ? ' · edited' : ''}` : ''}
        </Text>
        <Text
          style={{
            color: visible ? COLORS.text : COLORS.textMuted,
            fontStyle: visible ? 'normal' : 'italic',
          }}
        >
          {visible ? c.body : c.status === 'deleted' ? '[deleted]' : '[removed]'}
        </Text>
        {visible ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 6 }}>
            <VoteControl
              target={{ type: 'comment', id: c.id }}
              score={c.score}
              myVote={c.myVote}
              compact
              onError={onError}
            />
            {onReply ? <Button variant="link" title="Reply" onPress={onReply} /> : null}
            {onDelete ? <Button variant="link" title="Delete" onPress={onDelete} /> : null}
            {onReport ? <Button variant="link" title="Report" onPress={onReport} /> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}
