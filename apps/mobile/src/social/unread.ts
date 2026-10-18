import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { social } from './api';

/**
 * D76: the bell's unread count. Checked every 30 s while the app is open and on screen
 * (one small indexed query on the server), and right after anything that changes it.
 * Live updates can replace the polling later without changing the screens.
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

export async function refreshUnread() {
  try {
    set((await social.unread()).unread);
  } catch {
    // Offline or signed out: keep the last count.
  }
}

export function clearUnread() {
  set(0);
}

function start() {
  if (timer) return;
  void refreshUnread();
  timer = setInterval(() => {
    if (AppState.currentState === 'active') void refreshUnread();
  }, POLL_MS);
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

export function useUnreadCount(enabled: boolean) {
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
    start();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refreshUnread();
    });
    return () => {
      sub.remove();
      if (--users === 0) stop();
    };
  }, [enabled]);
  return enabled ? count : 0;
}
