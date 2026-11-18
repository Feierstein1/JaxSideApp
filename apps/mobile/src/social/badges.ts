import { useEffect, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { api } from '@/api';
import { invalidate } from '@/cache';

/**
 * Q26: the two top-bar badges (Messages, D98; the bell, D76) from one request. Checked
 * every 60 s (D259; was 30) while the app is open and on screen, when it comes back to the front, and
 * right after anything that changes a count. One timer however many badges are showing.
 */
export interface Badges {
  messages: number;
  notifications: number;
  /** D241: followed events on today (a quiet dot on the Events tab). */
  eventsToday: number;
}
const POLL_MS = 60_000; // D259: was 30 s
const MIN_GAP_MS = 10_000;
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
  // D259: something new in the bell may be a friend request or acceptance: don't show an old list.
  if (next.notifications > badges.notifications) invalidate('friends:');
  badges = next;
  listeners.forEach((l) => l());
}

let lastFetch = 0;
/** D259: the timer, mount and "back to the front" checks skip a request made under 10 s ago. */
function refreshIfStale() {
  if (Date.now() - lastFetch >= MIN_GAP_MS) void refreshBadges();
}

export async function refreshBadges() {
  lastFetch = Date.now();
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
      refreshIfStale();
      timer = setInterval(() => {
        if (AppState.currentState === 'active') refreshIfStale();
      }, POLL_MS);
    }
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') refreshIfStale();
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
