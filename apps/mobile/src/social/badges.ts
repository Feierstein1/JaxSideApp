import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { api } from '@/api';

/**
 * Q26: the two top-bar badges (Messages, D98; the bell, D76) from one request. Checked
 * every 30 s while the app is open and on screen, when it comes back to the front, and
 * right after anything that changes a count. One timer however many badges are showing.
 */
export interface Badges {
  messages: number;
  notifications: number;
  /** D241: followed events on today (a quiet dot on the Events tab). */
  eventsToday: number;
}
const POLL_MS = 30_000;
let badges: Badges = { messages: 0, notifications: 0, eventsToday: 0 };
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;
let users = 0;

function set(next: Badges) {
  if (
    next.messages === badges.messages &&
    next.notifications === badges.notifications &&
    next.eventsToday === badges.eventsToday
  ) {
    return;
  }
  badges = next;
  listeners.forEach((l) => l());
}

export async function refreshBadges() {
  try {
    const r = await api.get<Badges>('/api/v1/badges');
    set({
      messages: r.messages,
      notifications: r.notifications,
      eventsToday: r.eventsToday ?? 0,
    });
  } catch {
    // Offline or signed out: keep the last counts.
  }
}

/** Opening the bell's list marks everything read. */
export function clearNotificationBadge() {
  set({ ...badges, notifications: 0 });
}

export function useBadge(which: keyof Badges, enabled: boolean) {
  const count = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => badges[which],
  );
  useEffect(() => {
    if (!enabled) return;
    users++;
    if (!timer) {
      void refreshBadges();
      timer = setInterval(() => {
        if (AppState.currentState === 'active') void refreshBadges();
      }, POLL_MS);
    }
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refreshBadges();
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
