import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, AppState, FlatList, Image, Pressable, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import {
  DARK,
  MESSAGE_MAX,
  MESSAGE_PHOTOS_MAX,
  type ChatMessage,
  type ReportTarget,
} from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { photoUri, pickPhoto, uploadPhoto, type Uploaded } from '@/discussion/photos';
import { sendScreened } from '@/discussion/screening';
import { postTime } from '@/format';
import { haptic } from '@/motion';
import { ensureGuide } from '@/guides/guide';
import { ReportSheet } from '@/report/ReportSheet';
import { messagesApi } from '@/social/messages-api';
import { ACTIVE_POLL_MS, shouldPoll } from '@/social/chat-pace';
import { refreshUnreadMessages } from '@/social/messages-unread';
import { Text, TextInput } from '@/text';
import { RADIUS, SPACE, TYPE } from '@/tokens';
import { ErrorState, KeyboardSafeView, openMenu } from '@/ui';

/**
 * D98: a chat with one friend. Newest at the bottom; scroll up for older. Long-press a
 * message: Unsend (yours, 15 min), Delete for me, or Report (theirs).
 */
export default function Chat() {
  const { username } = useLocalSearchParams<{ username: string }>();
  const [messages, setMessages] = useState<ChatMessage[]>();
  const [canSend, setCanSend] = useState(true);
  const [older, setOlder] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  const [text, setText] = useState('');
  const [photos, setPhotos] = useState<(Uploaded & { localUri: string })[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sending, setSending] = useState(false);
  const [reporting, setReporting] = useState<ReportTarget>();
  const focused = useRef(false);
  /**
   * D114: an open chat checks every 3 s while the conversation is active and slows to every
   * 30 s after 2 quiet minutes. Sending, a new message arriving, typing and scrolling count.
   */
  const lastActivity = useRef(Date.now());
  const lastPoll = useRef(0);
  const newestId = useRef<string | null>(null);
  const active = () => {
    lastActivity.current = Date.now();
  };

  const load = useCallback(async () => {
    lastPoll.current = Date.now();
    try {
      const r = await messagesApi.chat(username);
      const newest = r.messages[r.messages.length - 1]?.id ?? null;
      if (newestId.current !== null && newest !== newestId.current) active(); // something new
      newestId.current = newest;
      // Keep any older pages already loaded; replace the newest page.
      setMessages((prev) => {
        const keep = (prev ?? []).filter(
          (m) => r.messages.length && m.createdAt < r.messages[0]!.createdAt,
        );
        return [...keep, ...r.messages];
      });
      setCanSend(r.canSend);
      setOlder((o) => (o === null ? r.nextBefore : o));
      setError(undefined);
      void refreshUnreadMessages();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load the chat.');
    }
  }, [username]);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      active(); // opening the chat counts
      void load();
      const t = setInterval(() => {
        if (!focused.current || AppState.currentState !== 'active') return;
        if (shouldPoll(Date.now(), lastActivity.current, lastPoll.current)) void load();
      }, ACTIVE_POLL_MS);
      return () => {
        focused.current = false;
        clearInterval(t);
      };
    }, [load]),
  );

  async function loadOlder() {
    if (!older) return;
    try {
      const r = await messagesApi.chat(username, older);
      setMessages((prev) => [...r.messages, ...(prev ?? [])]);
      setOlder(r.nextBefore);
    } catch {
      // try again on the next scroll
    }
  }

  async function addPhoto() {
    const asset = await pickPhoto();
    if (!asset) return;
    setUploading(true);
    try {
      const up = await uploadPhoto(asset);
      setPhotos((p) => [...p, { ...up, localUri: asset.uri }]);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t add the photo.');
    } finally {
      setUploading(false);
    }
  }

  async function send() {
    const body = text.trim();
    if (!body && !photos.length) return;
    if (!(await ensureGuide('message'))) return; // D104
    active();
    setSending(true);

    try {
      const sent = await sendScreened((ok) =>
        messagesApi.send(
          username,
          body,
          photos.map((p) => p.id),
          ok,
        ),
      );
      if (!sent) return;
      haptic.tap();
      setText('');
      setPhotos([]);
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t send.');
    } finally {
      setSending(false);
    }
  }

  function actions(m: ChatMessage) {
    openMenu(m.mine ? 'Your message' : 'Message', [
      ...(m.canUnsend
        ? [
            {
              label: 'Unsend (for both)',
              destructive: true,
              onPress: () => void messagesApi.unsend(m.id).then(load),
            },
          ]
        : []),
      {
        label: 'Delete for me',
        onPress: () =>
          void messagesApi
            .hide(m.id)
            .then(() => setMessages((all) => all?.filter((x) => x.id !== m.id))),
      },
      ...(!m.mine
        ? [
            {
              label: 'Report',
              destructive: true,
              onPress: () => setReporting({ type: 'message', id: m.id }),
            },
          ]
        : []),
    ]);
  }

  const ordered = [...(messages ?? [])].reverse(); // inverted list: newest first
  return (
    <KeyboardSafeView style={{ backgroundColor: DARK.page }}>
      <Stack.Screen options={{ title: username }} />
      {error ? <ErrorState message={error} onRetry={() => void load()} /> : null}
      {!messages ? (
        <ActivityIndicator style={{ marginTop: 32 }} color={DARK.accent} />
      ) : (
        <FlatList
          inverted
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: SPACE.md, gap: 6 }}
          data={ordered}
          keyExtractor={(m) => m.id}
          onEndReached={() => void loadOlder()}
          onScrollBeginDrag={active}
          ListFooterComponent={
            messages.length === 0 ? (
              <Text
                style={[
                  TYPE.callout,
                  { color: DARK.textMuted, textAlign: 'center', marginTop: 24 },
                ]}
              >
                Say hi to {username}. Only the two of you see this chat.
              </Text>
            ) : undefined
          }
          renderItem={({ item }) => <Bubble m={item} onLongPress={() => actions(item)} />}
        />
      )}
      {canSend ? (
        <View style={{ padding: SPACE.sm, gap: 6, backgroundColor: DARK.bar }}>
          {photos.length ? (
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {photos.map((p) => (
                <Pressable
                  key={p.id}
                  accessibilityLabel="Remove photo"
                  onPress={() => setPhotos((all) => all.filter((x) => x.id !== p.id))}
                >
                  <Image
                    source={{ uri: p.localUri }}
                    style={{ width: 52, height: 52, borderRadius: 8 }}
                  />
                </Pressable>
              ))}
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Add a photo"
              disabled={uploading || photos.length >= MESSAGE_PHOTOS_MAX}
              onPress={() => void addPhoto()}
              style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
            >
              {uploading ? (
                <ActivityIndicator color={DARK.accent} />
              ) : (
                <Ionicons name="image-outline" size={24} color={DARK.accent} />
              )}
            </Pressable>
            <TextInput
              accessibilityLabel="Message"
              placeholder="Message"
              placeholderTextColor={DARK.textMuted}
              value={text}
              onChangeText={(v) => {
                active();
                setText(v);
              }}

              maxLength={MESSAGE_MAX}
              multiline
              style={{
                flex: 1,
                maxHeight: 120,
                minHeight: 40,
                paddingHorizontal: 14,
                paddingVertical: 9,
                borderRadius: RADIUS.lg,
                backgroundColor: DARK.raised,
                color: DARK.text,
                fontSize: 16,
              }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Send"
              disabled={sending || (!text.trim() && !photos.length)}
              onPress={() => void send()}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: text.trim() || photos.length ? DARK.accent : DARK.raised,
              }}
            >
              {sending ? (
                <ActivityIndicator color={DARK.onAccent} />
              ) : (
                <Ionicons
                  name="send"
                  size={18}
                  color={text.trim() || photos.length ? DARK.onAccent : DARK.textMuted}
                />
              )}
            </Pressable>
          </View>
        </View>
      ) : (
        <Text
          style={[TYPE.callout, { color: DARK.textMuted, padding: SPACE.md, textAlign: 'center' }]}
        >
          You can only message friends. Add {username} as a friend to reply.
        </Text>
      )}
      <ReportSheet target={reporting} onClose={() => setReporting(undefined)} />
    </KeyboardSafeView>
  );
}

function Bubble({ m, onLongPress }: { m: ChatMessage; onLongPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel={`${m.mine ? 'You' : 'They'}: ${m.body || 'photo'}, ${postTime(m.createdAt)}`}
      onLongPress={onLongPress}
      style={{
        alignSelf: m.mine ? 'flex-end' : 'flex-start',
        maxWidth: '80%',
        padding: 10,
        borderRadius: 16,
        borderBottomRightRadius: m.mine ? 4 : 16,
        borderBottomLeftRadius: m.mine ? 16 : 4,
        backgroundColor: m.mine ? DARK.accent : DARK.card,
        gap: 6,
      }}
    >
      {m.photos.map((p) => (
        <Image
          key={p.id}
          source={{ uri: photoUri(p.url) }}
          accessibilityLabel="Photo"
          style={{
            width: 220,
            height: p.width && p.height ? Math.min(300, (220 * p.height) / p.width) : 220,
            borderRadius: 10,
          }}
        />
      ))}
      {m.body ? (
        <Text style={{ fontSize: 16, color: m.mine ? DARK.onAccent : DARK.text }}>{m.body}</Text>
      ) : null}
      <Text
        style={{
          fontSize: 11,
          color: m.mine ? DARK.onAccent : DARK.textMuted,
          alignSelf: 'flex-end',
          opacity: 0.8,
        }}
      >
        {postTime(m.createdAt)}
      </Text>
    </Pressable>
  );
}
