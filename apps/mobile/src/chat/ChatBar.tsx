import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable } from 'react-native';
import { stopMedia } from '@/discussion/media-focus';
import { router, useFocusEffect } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK, type ChatStatus } from '@jax/shared';
import { useAuth } from '@/auth/AuthContext';
import { Text } from '@/text';
import { RADIUS, SPACE } from '@/tokens';
import { chat } from './api';

/** The bar checks again this often while Home is on screen; it also keeps you counted as here. */
const CHECK_MS = 60_000;

/**
 * D218: the slim "JaxSide Chat" bar under the Home header. It shows only when chat is open
 * where you are (switched on, enough people about) and you are a confirmed account; tapping it
 * opens the full-screen chat. Checking also tells the server you are here, which is how a room
 * finds out it has people in it.
 */
export function ChatBar({ reloadKey }: { reloadKey?: string }) {
  const { state } = useAuth();
  const eligible = state.status === 'signedIn' && state.user.emailVerified;
  const [status, setStatus] = useState<ChatStatus>();
  const live = useRef(true);

  const check = useCallback(async () => {
    if (!eligible) return;
    try {
      const s = await chat.status();
      if (live.current) setStatus(s);
    } catch {
      // Leave the bar as it was; the next check tries again.
    }
  }, [eligible]);

  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  // Check when Home comes into view, then every minute while the app is open.
  useFocusEffect(
    useCallback(() => {
      void check();
      const timer = setInterval(() => {
        if (AppState.currentState === 'active') void check();
      }, CHECK_MS);
      return () => clearInterval(timer);
    }, [check, reloadKey]),
  );

  if (!eligible || !status?.open || !status.room) return null;
  const room = status.room;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open JaxSide Chat for ${room.title}, ${status.people} here`}
      onPress={() => {
        stopMedia(); // D228
        router.push('/chat');
      }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.sm,
        marginHorizontal: 12,
        marginTop: 6,
        minHeight: 40,
        paddingHorizontal: SPACE.md,
        borderRadius: RADIUS.md,
        backgroundColor: DARK.accentSoft,
        borderWidth: 1,
        borderColor: DARK.accent,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Ionicons name="chatbubbles" size={18} color={DARK.accent} />
      <Text style={{ fontWeight: '800', fontSize: 14 }}>JaxSide Chat</Text>
      <Text numberOfLines={1} style={{ flex: 1, color: DARK.textMuted, fontSize: 13 }}>
        {room.title} · {status.people} here
      </Text>
      <Ionicons name="chevron-forward" size={16} color={DARK.textMuted} />
    </Pressable>
  );
}
