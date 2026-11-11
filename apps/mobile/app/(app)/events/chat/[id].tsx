import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppState,
  FlatList,
  Keyboard,
  Linking,
  Pressable,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CHAT_MAX, DARK, type ChatLine, type EventChatUpdate } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { chatClock } from '@/chat/api';
import { ChatLineRow } from '@/chat/ChatLineRow';
import { showMenu } from '@/dialog';
import { eventChat } from '@/events/api';
import { haptic } from '@/motion';
import { ReportSheet } from '@/report/ReportSheet';
import { Text } from '@/text';
import { RADIUS, SPACE } from '@/tokens';
import { EmptyState, KeyboardSafeView } from '@/ui';

/** Like area chat (D218): every 5 s while open, every 30 s after 2 quiet minutes. */
const ACTIVE_MS = 5_000;
const IDLE_MS = 30_000;
const IDLE_AFTER_MS = 120_000;
const KEEP = 150;

/** Why the chat can't be shown, from the server's answer. */
const CLOSED: Record<string, { title: string; body: string }> = {
  NOT_AT_EVENT: {
    title: 'You’ve left the event area',
    body: 'Event chat is only for people at the event. Head back to keep chatting.',
  },
  NOT_JOINED: {
    title: 'Join from the event page',
    body: 'Tap “Yes, I’m here” on the event’s page to join its chat.',
  },
  CHAT_CLOSED: {
    title: 'This event’s chat is closed',
    body: 'Event chat opens an hour before and closes two hours after the event.',
  },
};

/**
 * D230: an event's chat, full screen. Area chat's look and rules, with the organizer's
 * updates pinned at the top and a fixed "Emergency? Call 911" line: JaxSide is not an
 * emergency service, and emergency posts aren't allowed here.
 */
export default function EventChatScreen() {
  const { id, title } = useLocalSearchParams<{ id: string; title?: string }>();
  const insets = useSafeAreaInsets();
  const { state } = useAuth();
  const me = state.status === 'signedIn' ? state.user.username : null;

  const [lines, setLines] = useState<ChatLine[]>([]);
  const [updates, setUpdates] = useState<EventChatUpdate[]>([]);
  const [people, setPeople] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [closed, setClosed] = useState<string | null>(null);
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
      const r = await eventChat.list(id, lastAt.current);
      setOffline(false);
      setClosed(null);
      setPeople(r.people);
      setMutedUntil(r.mutedUntil);
      if (r.updates.length) {
        setUpdates((prev) => {
          const have = new Set(prev.map((u) => u.id));
          return [...prev, ...r.updates.filter((u) => !have.has(u.id))];
        });
      }
      if (r.lines.length) lastActivity.current = Date.now();
      merge(r.lines);
    } catch (e) {
      if (e instanceof ApiRequestError && CLOSED[e.code]) setClosed(e.code);
      else setOffline(true); // weak signal in a crowd: keep trying quietly
    } finally {
      setLoaded(true);
    }
  }, [id, merge]);

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
      const r = await eventChat.send(id, body);
      atBottom.current = true;
      merge([r.line]);
      setText('');
      haptic.select();
    } catch (e) {
      if (e instanceof ApiRequestError) {
        if (e.code === 'CHAT_MUTED') {
          setMutedUntil((e.details as { mutedUntil?: string } | undefined)?.mutedUntil ?? null);
        }
        if (CLOSED[e.code]) setClosed(e.code);
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

  const canSend = !!text.trim() && !sending && !muted;
  const shut = closed ? CLOSED[closed] : null;

  return (
    <View style={{ flex: 1, backgroundColor: DARK.page }}>
      <View
        style={{
          backgroundColor: DARK.bar,
          paddingTop: insets.top + 4,
          paddingBottom: 6,
          paddingHorizontal: SPACE.sm,
          flexDirection: 'row',
          alignItems: 'center',
          gap: SPACE.sm,
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
        <View style={{ flex: 1 }}>
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={{ fontSize: 17, fontWeight: '800' }}
          >
            {title || 'Event chat'}
          </Text>
          {people ? (
            <Text style={{ fontSize: 12.5, color: DARK.textMuted }}>{people} here</Text>
          ) : null}
        </View>
        <Ionicons name="calendar" size={20} color={DARK.accent} style={{ marginRight: 8 }} />
      </View>

      {/* Fixed: JaxSide is never an emergency service. */}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Emergency? Call 911"
        onPress={() => void Linking.openURL('tel:911')}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingHorizontal: SPACE.md,
          paddingVertical: 6,
          backgroundColor: DARK.errorSoft,
        }}
      >
        <Ionicons name="call" size={14} color={DARK.error} />
        <Text style={{ fontSize: 12.5, fontWeight: '800', color: DARK.error }}>
          Emergency? Call 911
        </Text>
      </Pressable>

      {updates.length ? (
        <View
          style={{
            backgroundColor: DARK.tealSoft,
            borderBottomWidth: 1,
            borderBottomColor: DARK.hairline,
            paddingHorizontal: SPACE.md,
            paddingVertical: 8,
            gap: 4,
          }}
        >
          <Text style={{ fontSize: 11, fontWeight: '800', letterSpacing: 1, color: DARK.accent }}>
            ORGANIZER UPDATES
          </Text>
          {updates.slice(-3).map((u) => (
            <Text key={u.id} style={{ fontSize: 13.5 }}>
              <Text style={{ color: DARK.textMuted }}>{chatClock(u.createdAt)} · </Text>
              {u.body}
            </Text>
          ))}
        </View>
      ) : null}

      {shut ? (
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <EmptyState
            icon="chatbubbles-outline"
            title={shut.title}
            body={shut.body}
            action={{ label: 'Close', onPress: () => router.back() }}
          />
        </View>
      ) : (
        <KeyboardSafeView>
          {offline ? (
            <Text
              style={{ textAlign: 'center', fontSize: 12.5, color: DARK.textMuted, padding: 4 }}
            >
              Weak signal. Trying again…
            </Text>
          ) : null}
          <FlatList
            ref={listRef}
            data={lines}
            keyExtractor={(l) => l.id}
            renderItem={({ item }) => (
              <ChatLineRow line={item} mine={item.username === me} onName={onName} />
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
                  {loaded
                    ? 'Nobody has said anything yet. Ask what’s on, or where things are.'
                    : ''}
                </Text>
              </View>
            }
          />
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
              <Text style={{ fontSize: 12.5, color: DARK.error }}>
                {`You’re muted until ${chatClock(mutedUntil!)} for breaking the chat rules. You can still read.`}
              </Text>
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
          </View>
        </KeyboardSafeView>
      )}

      <ReportSheet
        target={reporting ? { type: 'eventChat', eventId: id, username: reporting } : undefined}
        onClose={() => setReporting(undefined)}
      />
    </View>
  );
}
