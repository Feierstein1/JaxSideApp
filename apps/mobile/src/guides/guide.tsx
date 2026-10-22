import { useEffect, useState, useSyncExternalStore } from 'react';
import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as SecureStore from 'expo-secure-store';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK, GUIDES, type GuideKey, type GuidePageKind } from '@jax/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { haptic, useReducedMotion } from '@/motion';
import { Text } from '@/text';
import { RADIUS, SPACE, TYPE } from '@/tokens';

/**
 * D104 (Phase 11): first-time guides. Before an action the first time, call
 * `await ensureGuide('areaPost')`: it resolves true at once if this account already finished
 * that guide (at its current version), or shows the guide and resolves true on "Got it" and
 * false if it was closed (cancel the action; it shows again next time). Finished guides are
 * remembered on the server per account (guests: on the phone). One `<GuideHost />` is
 * mounted at the app root. `reviewGuide(key)` reopens any guide (Account → Community rules).
 */

const GUEST_KEY = 'jax.guidesSeen';
let seen: Record<string, number> | null = null;
let who: string | null = null; // whose `seen` is loaded ('guest' or a user ID)

type Request = { key: GuideKey; review: boolean; resolve: (ok: boolean) => void };
let current: Request | null = null;
const waiting: Request[] = [];
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function next() {
  current = waiting.shift() ?? null;
  emit();
}

function showGuide(key: GuideKey, review = false): Promise<boolean> {
  return new Promise((resolve) => {
    waiting.push({ key, review, resolve });
    if (!current) next();
  });
}

/** Account → Community rules: read any guide again (nothing to cancel). */
export function reviewGuide(key: GuideKey) {
  void showGuide(key, true);
}

async function loadSeen(): Promise<Record<string, number>> {
  if (seen) return seen;
  if (who === 'guest') {
    const raw = await SecureStore.getItemAsync(GUEST_KEY).catch(() => null);
    seen = raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } else {
    seen = (await api.get<{ seen: Record<string, number> }>('/api/v1/me/guides')).seen;
  }
  return seen;
}

async function markSeen(key: GuideKey) {
  const version = GUIDES[key].version;
  seen = { ...(seen ?? {}), [key]: version };
  if (who === 'guest') {
    await SecureStore.setItemAsync(GUEST_KEY, JSON.stringify(seen)).catch(() => undefined);
  } else {
    await api.post('/api/v1/me/guides', { key }).catch(() => undefined);
  }
}

/**
 * A guide already on its way for a key. Two calls at once (React runs a screen's first effect
 * twice in development, or a double tap) share one showing, so a guide finished once never
 * pops up again right after.
 */
const inFlight = new Map<GuideKey, Promise<boolean>>();

export function ensureGuide(key: GuideKey): Promise<boolean> {
  const pending = inFlight.get(key);
  if (pending) return pending;
  const run = ensureGuideOnce(key).finally(() => inFlight.delete(key));
  inFlight.set(key, run);
  return run;
}

async function ensureGuideOnce(key: GuideKey): Promise<boolean> {
  if (!who) return true; // signed out: nothing to guide
  try {
    const s = await loadSeen();
    if ((s[key] ?? 0) >= GUIDES[key].version) return true;
  } catch {
    return true; // can't check right now: don't block the action
  }
  const ok = await showGuide(key);
  if (ok) await markSeen(key);
  return ok;
}

const KIND: Record<
  GuidePageKind,
  { label: string; icon: 'checkmark-circle' | 'close-circle' | 'information-circle'; color: string }
> = {
  do: { label: 'Do', icon: 'checkmark-circle', color: DARK.tealText },
  dont: { label: 'Don’t', icon: 'close-circle', color: DARK.error },
  info: { label: 'Good to know', icon: 'information-circle', color: DARK.accent },
};

/** Mount once at the app root. */
export function GuideHost() {
  const { state } = useAuth();
  const id =
    state.status === 'signedIn' ? state.user.id : state.status === 'guest' ? 'guest' : null;
  // Set while rendering (not in an effect) so screens' first effects already see who's here.
  if (id !== who) {
    who = id;
    seen = null; // a different account: load its own list
  }

  const req = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
  const [page, setPage] = useState(0);
  const reduced = useReducedMotion();
  const insets = useSafeAreaInsets();
  useEffect(() => setPage(0), [req]);
  if (!req) return null;
  const guide = GUIDES[req.key];
  const last = page === guide.pages.length - 1;
  const p = guide.pages[page]!;
  const kind = KIND[p.kind];

  const finish = (ok: boolean) => {
    if (ok) haptic.success();
    req.resolve(req.review ? true : ok);
    next();
  };

  return (
    <Modal
      visible
      transparent
      animationType={reduced ? 'none' : 'slide'}
      onRequestClose={() => finish(false)}
    >
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: DARK.scrim }}>
        <View
          style={{
            maxHeight: '85%',
            backgroundColor: DARK.card,
            borderTopLeftRadius: RADIUS.lg + 6,
            borderTopRightRadius: RADIUS.lg + 6,
            paddingTop: SPACE.lg,
            paddingHorizontal: SPACE.lg,
            paddingBottom: SPACE.lg + insets.bottom,
            gap: SPACE.md,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text accessibilityRole="header" style={[TYPE.title, { flex: 1, fontSize: 22 }]}>
              {guide.title}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={req.review ? 'Close' : 'Close and cancel'}
              onPress={() => finish(false)}
              hitSlop={10}
              style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="close" size={24} color={DARK.textMuted} />
            </Pressable>
          </View>

          <View
            accessible
            accessibilityLabel={`Page ${page + 1} of ${guide.pages.length}: ${kind.label}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            <Ionicons name={kind.icon} size={22} color={kind.color} />
            <Text style={{ fontWeight: '800', fontSize: 17, color: kind.color }}>{kind.label}</Text>
          </View>
          <ScrollView style={{ flexGrow: 0 }} contentContainerStyle={{ gap: SPACE.sm }}>
            {p.items.map((item) => (
              <View key={item} style={{ flexDirection: 'row', gap: 10 }}>
                <Ionicons
                  name={kind.icon}
                  size={18}
                  color={kind.color}
                  accessibilityLabel={kind.label}
                  style={{ marginTop: 2 }}
                />
                <Text style={[TYPE.body, { flex: 1 }]}>{item}</Text>
              </View>
            ))}
          </ScrollView>

          {/* Page dots */}
          {guide.pages.length > 1 ? (
            <View
              importantForAccessibility="no-hide-descendants"
              style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }}
            >
              {guide.pages.map((_, i) => (
                <View
                  key={i}
                  style={{
                    width: i === page ? 18 : 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: i === page ? DARK.accent : DARK.raised,
                  }}
                />
              ))}
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: SPACE.sm }}>
            {page > 0 ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => setPage(page - 1)}
                style={{
                  flex: 1,
                  minHeight: 48,
                  borderRadius: RADIUS.pill,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: DARK.raised,
                }}
              >
                <Text style={{ fontWeight: '800' }}>Back</Text>
              </Pressable>
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={() => (last ? finish(true) : setPage(page + 1))}
              style={{
                flex: 2,
                minHeight: 48,
                borderRadius: RADIUS.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: DARK.accent,
              }}
            >
              <Text style={{ fontWeight: '800', color: DARK.onAccent }}>
                {last ? (req.review ? 'Done' : guide.done) : 'Next'}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
