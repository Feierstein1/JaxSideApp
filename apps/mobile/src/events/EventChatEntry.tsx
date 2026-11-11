import { useCallback, useEffect, useState } from 'react';
import { AppState, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useFocusEffect } from 'expo-router';
import { DARK, localTime, timeLabel, type EventChatStatus, type EventDetail } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { useGuest } from '@/auth/guest';
import { DecoBox } from '@/deco';
import { showAlert } from '@/dialog';
import { dismiss, isDismissed, useDismissed } from '@/dismissed';
import { haptic } from '@/motion';
import { Text } from '@/text';
import { SPACE, TYPE } from '@/tokens';
import { Button } from '@/ui';
import { eventChat } from './api';

/** Checked again every minute while the event page is open (you may walk in). */
const EVERY_MS = 60_000;

/**
 * D230: the way into an event's chat, on the event page. While the chat is open (an hour
 * before to two hours after) and you're inside the event area, a small card asks "Are you at
 * [event]?" (not a pop-up). Yes opens the chat; Not now hides the card for this date. People
 * nearby but not at it see that the chat is open for people there.
 */
export function EventChatEntry({ event }: { event: EventDetail }) {
  const { state } = useAuth();
  const { isGuest } = useGuest();
  useDismissed();
  const signedIn = state.status === 'signedIn' && !isGuest;
  const [status, setStatus] = useState<EventChatStatus | null>(null);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    if (!signedIn || event.cancelled || AppState.currentState !== 'active') return;
    try {
      setStatus(await eventChat.status(event.id));
    } catch {
      // Quietly try again later (weak signal in crowds).
    }
  }, [signedIn, event.cancelled, event.id]);

  useFocusEffect(
    useCallback(() => {
      void check();
    }, [check]),
  );
  useEffect(() => {
    const t = setInterval(() => void check(), EVERY_MS);
    return () => clearInterval(t);
  }, [check]);

  if (!status || !signedIn) return null;
  const key = `eventchat:${status.sessionId}`;

  if (status.state === 'closed') {
    const soon =
      status.opensAt &&
      Date.parse(status.opensAt) > Date.now() &&
      Date.parse(status.opensAt) - Date.now() < 24 * 3_600_000;
    return soon ? (
      <Note
        icon="chatbubbles-outline"
        text={`Event chat opens at ${timeLabel(localTime(status.opensAt!))} for people at the event.`}
      />
    ) : null;
  }
  if (status.state === 'away') {
    return (
      <Note
        icon="chatbubbles-outline"
        text={`Event chat is open for people at the event${status.people ? ` (${status.people} there)` : ''}. Head over to join in.`}
      />
    );
  }
  if (status.state === 'ask') {
    if (isDismissed(key)) return null;
    return (
      <DecoBox
        shape="chamfer"
        fill={DARK.tealSoft}
        stroke={DARK.accent}
        style={{ padding: SPACE.md, gap: SPACE.sm }}
      >
        <View style={{ flexDirection: 'row', gap: SPACE.sm, alignItems: 'center' }}>
          <Ionicons name="location" size={18} color={DARK.accent} />
          <Text accessibilityRole="header" style={[TYPE.label, { flex: 1 }]}>
            Are you at {event.title}?
          </Text>
        </View>
        <Text style={[TYPE.caption, { color: DARK.textMuted }]}>
          Join the event chat to ask where things are and what’s on. Only people here can see it.
        </Text>
        <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
          <Button
            title="Yes, I’m here"
            icon="checkmark"
            busy={busy}
            style={{ flex: 1, marginTop: 0 }}
            onPress={async () => {
              setBusy(true);
              try {
                await eventChat.join(event.id);
                haptic.success();
                router.push({
                  pathname: '/events/chat/[id]',
                  params: { id: event.id, title: event.title },
                });
                void check();
              } catch (e) {
                showAlert('Couldn’t join', e instanceof ApiRequestError ? e.message : 'Try again.');
              } finally {
                setBusy(false);
              }
            }}
          />
          <Button
            title="Not now"
            variant="secondary"
            style={{ flex: 1, marginTop: 0 }}
            onPress={() => dismiss([key])}
          />
        </View>
      </DecoBox>
    );
  }
  return (
    <Button
      title={`Event chat${status.people ? ` · ${status.people} here` : ''}`}
      icon="chatbubbles"
      variant="teal"
      onPress={() =>
        router.push({ pathname: '/events/chat/[id]', params: { id: event.id, title: event.title } })
      }
      style={{ marginTop: 0 }}
    />
  );
}

function Note({ icon, text }: { icon: 'chatbubbles-outline'; text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: SPACE.sm, alignItems: 'flex-start' }}>
      <Ionicons name={icon} size={18} color={DARK.textMuted} style={{ marginTop: 1 }} />
      <Text style={[TYPE.caption, { color: DARK.textMuted, flex: 1 }]}>{text}</Text>
    </View>
  );
}
