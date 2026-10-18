import { useEffect, useSyncExternalStore } from 'react';
import { Pressable, Text, View } from 'react-native';
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
      <View
        style={{
          backgroundColor: BRAND.gold,
          borderRadius: 999,
          paddingHorizontal: 10,
          paddingVertical: 4,
          marginRight: 4,
        }}
      >
        {/* Black on gold (D33). */}
        <Text style={{ color: COLORS.onAccent, fontWeight: '800', fontSize: 12 }}>GUEST</Text>
      </View>
    );
  }
  if (state.status !== 'signedIn') return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={isHidden ? 'Show my username' : 'Hide my username'}
      onPress={toggle}
      hitSlop={8}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 32,
        paddingHorizontal: 10,
        borderRadius: 999,
        marginRight: 4,
        backgroundColor: COLORS.surfaceDarkRaised,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{ color: COLORS.onSurfaceInverse, fontWeight: '700', fontSize: 13, maxWidth: 110 }}
        numberOfLines={1}
      >
        {isHidden ? '••••••' : `@${state.user.username}`}
      </Text>
      <Ionicons name={isHidden ? 'eye-off-outline' : 'eye-outline'} size={16} color={BRAND.gold} />
    </Pressable>
  );
}
