import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { messagesApi } from './messages-api';

/**
 * D97: the Messages badge (chats with something you haven't seen). Checked every 30 s
 * while the app is open, like the bell (D76), and right after opening a chat.
 */
const POLL_MS = 30_000;
let unread = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let users = 0;

function set(n: number) {
  if (n === unread) return;
  unread = n;
  listeners.forEach((l) => l());
}

export async function refreshUnreadMessages() {
  try {
    set((await messagesApi.unread()).unread);
  } catch {
    // offline or signed out: keep the last count
  }
}

export function useUnreadMessages(enabled: boolean) {
  const count = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => unread,
  );
  useEffect(() => {
    if (!enabled) return;
    users++;
    if (!timer) {
      void refreshUnreadMessages();
      timer = setInterval(() => {
        if (AppState.currentState === 'active') void refreshUnreadMessages();
      }, POLL_MS);
    }
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refreshUnreadMessages();
    });
    return () => {
      sub.remove();
      if (--users === 0 && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, [enabled]);
  return enabled ? count : 0;
}
