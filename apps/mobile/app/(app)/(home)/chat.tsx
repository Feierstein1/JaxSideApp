import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
  Keyboard,
  Pressable,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CHAT_MAX, DARK, type ChatLine, type ChatRoomInfo } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { chat, chatClock } from '@/chat/api';
import { showMenu } from '@/dialog';
import { haptic } from '@/motion';
import { ReportSheet } from '@/report/ReportSheet';
import { Text } from '@/text';
import { RADIUS, SPACE } from '@/tokens';
import { EmptyState, KeyboardSafeView } from '@/ui';

/** D218: new lines every 5 seconds while the chat is open; every 30 s after 2 quiet minutes. */
const ACTIVE_MS = 5_000;
const IDLE_MS = 30_000;
const IDLE_AFTER_MS = 120_000;
const KEEP = 150;

/** One line: the username (tap for the profile or a report), the time, then the text. */
const Line = memo(function Line({
  line,
  mine,
  onName,
}: {
  line: ChatLine;
  mine: boolean;
  onName: (username: string) => void;
}) {
  return (
    <View
      style={[
        { paddingHorizontal: SPACE.md, paddingVertical: 5 },
        // Staff lines stand out: the gold-tinted card and gold edge used on staff posts (D155).
        line.admin
          ? {
              backgroundColor: DARK.adminCard,
              borderLeftWidth: 4,
              borderLeftColor: DARK.adminEdge,
              marginVertical: 2,
            }
          : null,
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8 }}>
        <Text
          accessibilityRole={mine ? undefined : 'button'}
          accessibilityLabel={mine ? 'You' : `${line.username}: profile or report`}
          onPress={mine ? undefined : () => onName(line.username)}
          style={{
            fontSize: 13.5,
            fontWeight: '800',
            // Staff lines are gold (on dark); your own name is plain; others' names look tappable.
            color: line.admin ? DARK.adminEdge : mine ? DARK.text : DARK.accent,
          }}
        >
          {line.username}
        </Text>
        {line.admin ? (
          // The same blue as JAX in the JAXSIDE name (DARK.accent).
          <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: DARK.accent }}>
            ADMIN
          </Text>
        ) : null}
        <Text style={{ fontSize: 11, color: DARK.textMuted }}>{chatClock(line.createdAt)}</Text>
      </View>
      <Text style={{ fontSize: 14, lineHeight: 20 }}>{line.body}</Text>
    </View>
  );
});

/**
 * D218: the full-screen area chat. A close button at the top left and "JaxSide Chat" at the top
 * right; under them the area it is for; then the lines (text only, no search); the box to type
 * in sits at the very bottom with a send icon, and rises above the keyboard (D192). One tap in
 * the box, type, one tap to send.
 */
export default function ChatScreen() {
  const insets = useSafeAreaInsets();
  const { state } = useAuth();
  const me = state.status === 'signedIn' ? state.user.username : null;

  const [lines, setLines] = useState<ChatLine[]>([]);
  const [room, setRoom] = useState<ChatRoomInfo>();
  const [people, setPeople] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [closed, setClosed] = useState(false);
  const [offline, setOffline] = useState(false);
  const [mutedUntil, setMutedUntil] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [reporting, setReporting] = useState<string>();
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const listRef = useRef<FlatList<ChatLine>>(null);
  const atBottom = useRef(true);
  const lastActivity = useRef(Date.now());
  const lastAt = useRef<string | undefined>(undefined);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardOpen(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardOpen(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const merge = useCallback((incoming: ChatLine[]) => {
    if (!incoming.length) return;
    lastAt.current = incoming[incoming.length - 1]!.createdAt;
    setLines((prev) => {
      const have = new Set(prev.map((l) => l.id));
      const add = incoming.filter((l) => !have.has(l.id));
      return add.length ? [...prev, ...add].slice(-KEEP) : prev;
    });
  }, []);

  const refresh = useCallback(async () => {
    try {
      const r = await chat.list(lastAt.current);
      setOffline(false);
      setRoom(r.room);
      setPeople(r.people);
      setMutedUntil(r.mutedUntil);
      if (r.lines.length) lastActivity.current = Date.now();
      merge(r.lines);
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === 'CHAT_CLOSED') setClosed(true);
      else setOffline(true);
    } finally {
      setLoaded(true);
    }
  }, [merge]);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stop) return;
      if (AppState.currentState === 'active') await refresh();
      if (stop) return;
      const idle = Date.now() - lastActivity.current >= IDLE_AFTER_MS;
      timer = setTimeout(() => void tick(), idle ? IDLE_MS : ACTIVE_MS);
    };
    void tick();
    return () => {
      stop = true;
      if (timer) clearTimeout(timer);
    };
  }, [refresh]);

  const muted = !!mutedUntil && new Date(mutedUntil).getTime() > Date.now();

  async function send() {
    const body = text.trim();
    if (!body || sending || muted) return;
    setSending(true);
    setError(undefined);
    lastActivity.current = Date.now();
    try {
      const r = await chat.send(body);
      atBottom.current = true;
      merge([r.line]);
      setText('');
      haptic.select();
    } catch (e) {
      if (e instanceof ApiRequestError) {
        if (e.code === 'CHAT_MUTED') {
          setMutedUntil((e.details as { mutedUntil?: string } | undefined)?.mutedUntil ?? null);
        }
        if (e.code === 'CHAT_CLOSED') setClosed(true);
        setError(e.message);
      } else {
        setError('Couldn’t send. Check your connection.');
      }
    } finally {
      setSending(false);
    }
  }

  function onName(username: string) {
    showMenu(`@${username}`, [
      {
        label: 'View profile',
        icon: 'person-outline',
        onPress: () => router.push(`/user/${encodeURIComponent(username)}`),
      },
      {
        label: 'Report chat rule-breaking',
        icon: 'flag-outline',
        destructive: true,
        onPress: () => setReporting(username),
      },
    ]);
  }

  function onScroll(e: NativeSyntheticEvent<NativeScrollEvent>) {
    const { contentOffset, layoutMeasurement, contentSize } = e.nativeEvent;
    atBottom.current = contentOffset.y + layoutMeasurement.height >= contentSize.height - 40;
    lastActivity.current = Date.now();
  }

  const mutedText = mutedUntil
    ? `You’re muted until ${chatClock(mutedUntil)} for breaking the chat rules. You can still read.`
    : '';
  const canSend = !!text.trim() && !sending && !muted;

  return (
    <View style={{ flex: 1, backgroundColor: DARK.page }}>
      {/* Top bar: close at the left, the chat's name at the right. */}
      <View
        style={{
          backgroundColor: DARK.bar,
          paddingTop: insets.top + 4,
          paddingBottom: 6,
          paddingHorizontal: SPACE.sm,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close chat"
          onPress={() => router.back()}
          hitSlop={8}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="close" size={28} color={DARK.text} />
        </Pressable>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingRight: 8 }}>
          <Ionicons name="chatbubbles" size={20} color={DARK.accent} />
          <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: '800' }}>
            JaxSide Chat
          </Text>
        </View>
      </View>

      {/* Which area this chat is for. */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: SPACE.md,
          paddingVertical: 8,
          backgroundColor: DARK.card,
          borderBottomWidth: 1,
          borderBottomColor: DARK.hairline,
        }}
      >
        <Ionicons name="location" size={15} color={DARK.tealText} />
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, fontWeight: '700' }}>
          {room ? room.title : 'Finding your area…'}
          {room?.zip ? (
            <Text style={{ color: DARK.textMuted, fontWeight: '500' }}>{`  ${room.zip}`}</Text>
          ) : null}
        </Text>
        {people ? (
          <Text style={{ fontSize: 12.5, color: DARK.textMuted }}>{people} here</Text>
        ) : null}
      </View>

      {closed ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            icon="chatbubbles-outline"
            title="Chat isn’t open here right now"
            body="Area chat opens when enough people are around. Check back soon."
            action={{ label: 'Close', onPress: () => router.back() }}
          />
        </View>
      ) : (
        <KeyboardSafeView>
          {offline ? (
            <Text
              style={{ textAlign: 'center', fontSize: 12.5, color: DARK.textMuted, padding: 4 }}
            >
              Can’t reach chat. Trying again…
            </Text>
          ) : null}
          <FlatList
            ref={listRef}
            data={lines}
            keyExtractor={(l) => l.id}
            renderItem={({ item }) => (
              <Line line={item} mine={item.username === me} onName={onName} />
            )}
            onScroll={onScroll}
            scrollEventThrottle={64}
            onContentSizeChange={() => {
              if (atBottom.current) listRef.current?.scrollToEnd({ animated: true });
            }}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingVertical: SPACE.sm, flexGrow: 1 }}
            ListEmptyComponent={
              <View style={{ padding: SPACE.xl, alignItems: 'center' }}>
                <Text style={{ color: DARK.textMuted, textAlign: 'center', fontSize: 14 }}>
                  {loaded ? 'Nobody has said anything yet. Say hi to your neighbors.' : ''}
                </Text>
              </View>
            }
          />

          {/* The box and send icon, at the very bottom. */}
          <View
            style={{
              paddingHorizontal: SPACE.sm,
              paddingTop: 8,
              paddingBottom: 8 + (keyboardOpen ? 0 : insets.bottom),
              backgroundColor: DARK.bar,
              gap: 4,
            }}
          >
            {muted ? (
              <Text style={{ fontSize: 12.5, color: DARK.error }}>{mutedText}</Text>
            ) : error ? (
              <Text accessibilityRole="alert" style={{ fontSize: 12.5, color: DARK.error }}>
                {error}
              </Text>
            ) : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <TextInput
                value={text}
                onChangeText={(t) => {
                  setText(t);
                  lastActivity.current = Date.now();
                }}
                editable={!muted}
                placeholder={muted ? 'Muted' : 'Say something…'}
                placeholderTextColor={DARK.placeholder}
                maxLength={CHAT_MAX}
                returnKeyType="send"
                blurOnSubmit={false}
                enablesReturnKeyAutomatically
                onSubmitEditing={() => void send()}
                accessibilityLabel="Type a chat message"
                style={{
                  flex: 1,
                  minHeight: 44,
                  paddingHorizontal: 14,
                  borderRadius: RADIUS.pill,
                  backgroundColor: DARK.raised,
                  color: DARK.text,
                  fontSize: 15,
                }}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Send"
                accessibilityState={{ disabled: !canSend, busy: sending }}
                disabled={!canSend}
                onPress={() => void send()}
                style={({ pressed }) => ({
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: canSend ? DARK.accent : DARK.raised,
                  opacity: pressed ? 0.8 : 1,
                })}
              >
                <Ionicons name="send" size={19} color={canSend ? DARK.onAccent : DARK.textMuted} />
              </Pressable>
            </View>
            {text.length >= CHAT_MAX - 30 ? (
              <Text style={{ fontSize: 11.5, color: DARK.textMuted, textAlign: 'right' }}>
                {text.length}/{CHAT_MAX}
              </Text>
            ) : null}
          </View>
        </KeyboardSafeView>
      )}

      <ReportSheet
        target={reporting ? { type: 'chat', username: reporting } : undefined}
        onClose={() => setReporting(undefined)}
      />
    </View>
  );
}
