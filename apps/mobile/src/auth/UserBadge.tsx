import { useEffect, useSyncExternalStore } from 'react';
import { Pressable, Text } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BRAND, COLORS } from '@jax/shared';
import { useAuth } from './AuthContext';

/**
 * "Hide my name on screen" (D43): a per-device display preference, e.g. when showing the
 * phone to someone. It only affects this screen; posts still show the username to others.
 */
const KEY = 'jax.hideNameOnScreen';
let hidden = false;
let loaded = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

async function load() {
  if (loaded) return;
  loaded = true;
  hidden = (await SecureStore.getItemAsync(KEY).catch(() => null)) === '1';
  emit();
}

function toggle() {
  hidden = !hidden;
  emit();
  void SecureStore.setItemAsync(KEY, hidden ? '1' : '0').catch(() => undefined);
}

/**
 * Whether "hide my name on screen" is on. D73: also hides the ★ that marks your own posts,
 * so someone looking at the screen can't tell which posts are yours.
 */
export function useNameHidden() {
  const isHidden = useSyncExternalStore(subscribe, () => hidden);
  useEffect(() => {
    void load();
  }, []);
  return isHidden;
}

/** Signed-in username in the top bar, with an eye button to hide it. Gold on black (D33). */
export function UserBadge() {
  const { state } = useAuth();
  const isHidden = useSyncExternalStore(subscribe, () => hidden);
  useEffect(() => {
    void load();
  }, []);
  if (state.status === 'guest') {
    return (
      <Text style={{ color: BRAND.gold, fontWeight: '700', paddingHorizontal: 4 }}>GUEST</Text>
    );
  }
  if (state.status !== 'signedIn') return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isHidden ? 'Show my username' : 'Hide my username'}
      onPress={toggle}
      hitSlop={8}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 }}
    >
      <Text
        style={{ color: COLORS.onSurfaceInverse, fontWeight: '600', maxWidth: 120 }}
        numberOfLines={1}
      >
        {isHidden ? '••••••' : `@${state.user.username}`}
      </Text>
      <Ionicons name={isHidden ? 'eye-off-outline' : 'eye-outline'} size={18} color={BRAND.gold} />
    </Pressable>
  );
}
