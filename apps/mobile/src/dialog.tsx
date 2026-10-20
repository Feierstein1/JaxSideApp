import { useEffect, useRef, useSyncExternalStore } from 'react';
import { Animated, Modal, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { DARK } from '@jax/shared';
import { haptic, useReducedMotion } from './motion';
import { Text } from './text';
import { RADIUS, SPACE, TYPE, elevation } from './tokens';
import type { IconName } from './ui';

/**
 * D97: the app's own pop-ups, replacing the phone's plain system dialogs (React Native's
 * `Alert` can't be styled). One `<DialogHost />` is mounted at the app root; screens call:
 *
 * - `showAlert(title, message?, buttons?, { icon, tone })`: same arguments as `Alert.alert`,
 *   shown as a dark rounded card with an icon, the title, the message and themed buttons.
 * - `showMenu(title, items)`: the "•••" menu as a bottom sheet (any number of actions).
 *
 * Requests queue up, so a follow-up ("Thanks") shows after the first one closes. The
 * Android back button and tapping outside act as Cancel (or OK when there's only one
 * button). Respects reduce motion.
 */

export interface DialogButton {
  text: string;
  style?: 'default' | 'cancel' | 'destructive';
  onPress?: () => void;
}

export type DialogTone = 'info' | 'success' | 'warning' | 'danger';

export interface MenuItem {
  label: string;
  icon?: IconName;
  destructive?: boolean;
  onPress: () => void;
}

type Request =
  | {
      kind: 'alert';
      id: number;
      title: string;
      message?: string;
      buttons: DialogButton[];
      icon?: IconName;
      tone: DialogTone;
    }
  | { kind: 'menu'; id: number; title: string; items: MenuItem[] };

let queue: Request[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function push(r: Request) {
  queue = [...queue, r];
  emit();
}

/** Shows the app's dialog. Same arguments as `Alert.alert`, plus an icon and a tone. */
export function showAlert(
  title: string,
  message?: string,
  buttons?: DialogButton[],
  options: { icon?: IconName; tone?: DialogTone } = {},
) {
  const list = buttons?.length ? buttons : [{ text: 'OK' }];
  const tone = options.tone ?? (list.some((b) => b.style === 'destructive') ? 'danger' : 'info');
  push({ kind: 'alert', id: nextId++, title, message, buttons: list, icon: options.icon, tone });
}

/** Shows the "•••" actions as a bottom sheet. */
export function showMenu(title: string, items: MenuItem[]) {
  push({ kind: 'menu', id: nextId++, title, items });
}

/** Closes the current dialog, then runs the chosen action. */
function close(after?: () => void) {
  queue = queue.slice(1);
  emit();
  after?.();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

const TONES: Record<DialogTone, { fg: string; bg: string; icon: IconName }> = {
  info: { fg: DARK.accent, bg: DARK.accentSoft, icon: 'information-circle' },
  success: { fg: DARK.tealText, bg: DARK.tealSoft, icon: 'checkmark-circle' },
  warning: { fg: DARK.accent, bg: DARK.accentSoft, icon: 'alert-circle' },
  danger: { fg: DARK.error, bg: DARK.errorSoft, icon: 'warning' },
};

/** Mount once at the app root. */
export function DialogHost() {
  const current = useSyncExternalStore(subscribe, () => queue[0]);
  const reduced = useReducedMotion();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!current) return;
    if (current.kind === 'alert' && current.tone === 'danger') haptic.warn();
    anim.setValue(reduced ? 1 : 0);
    if (!reduced) {
      Animated.spring(anim, {
        toValue: 1,
        useNativeDriver: true,
        speed: 22,
        bounciness: 5,
      }).start();
    }
  }, [current, reduced, anim]);

  // Back button / tap outside: the Cancel button's action, or just close.
  function dismiss() {
    if (!current) return;
    if (current.kind === 'menu') return close();
    const cancel =
      current.buttons.find((b) => b.style === 'cancel') ??
      (current.buttons.length === 1 ? current.buttons[0] : undefined);
    if (cancel) close(cancel.onPress);
  }

  return (
    <Modal
      visible={!!current}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={dismiss}
    >
      {current ? (
        <View
          style={{
            flex: 1,
            justifyContent: current.kind === 'menu' ? 'flex-end' : 'center',
            alignItems: 'center',
          }}
        >
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: DARK.scrim }]}
            onPress={dismiss}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
          {current.kind === 'alert' ? (
            <AlertCard key={current.id} req={current} anim={anim} reduced={reduced} />
          ) : (
            <MenuSheet key={current.id} req={current} anim={anim} reduced={reduced} />
          )}
        </View>
      ) : null}
    </Modal>
  );
}

function AlertCard({
  req,
  anim,
  reduced,
}: {
  req: Extract<Request, { kind: 'alert' }>;
  anim: Animated.Value;
  reduced: boolean;
}) {
  const { width } = useWindowDimensions();
  const tone = TONES[req.tone];
  // Cancel on the left (or last when stacked), the action on the right (or first).
  const cancel = req.buttons.filter((b) => b.style === 'cancel');
  const actions = req.buttons.filter((b) => b.style !== 'cancel');
  const stacked = req.buttons.length > 2 || req.buttons.some((b) => b.text.length > 16);
  const ordered = stacked ? [...actions, ...cancel] : [...cancel, ...actions];

  return (
    <Animated.View
      accessibilityViewIsModal
      style={{
        width: Math.min(360, width - 48),
        borderRadius: RADIUS.xl,
        backgroundColor: DARK.card,
        borderWidth: 1,
        borderColor: DARK.hairline,
        paddingHorizontal: SPACE.xl - 2,
        paddingTop: SPACE.xl,
        paddingBottom: SPACE.lg + 2,
        alignItems: 'center',
        ...elevation(3),
        opacity: anim,
        transform: reduced
          ? []
          : [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) }],
      }}
    >
      <View
        style={{
          width: 60,
          height: 60,
          borderRadius: 30,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: tone.bg,
          marginBottom: SPACE.md + 2,
        }}
      >
        <Ionicons name={req.icon ?? tone.icon} size={30} color={tone.fg} />
      </View>
      <Text
        accessibilityRole="header"
        style={[TYPE.headline, { fontSize: 19, textAlign: 'center' }]}
      >
        {req.title}
      </Text>
      {req.message ? (
        <Text
          style={[
            TYPE.callout,
            { color: DARK.textMuted, textAlign: 'center', marginTop: SPACE.sm },
          ]}
        >
          {req.message}
        </Text>
      ) : null}
      <View
        style={{
          alignSelf: 'stretch',
          flexDirection: stacked ? 'column' : 'row',
          gap: SPACE.sm,
          marginTop: SPACE.xl - 2,
        }}
      >
        {ordered.map((b, i) => (
          <DialogButtonView
            key={`${b.text}${i}`}
            button={b}
            primary={b.style !== 'cancel' && (stacked ? i === 0 : i === ordered.length - 1)}
            flex={!stacked}
            onPress={() => close(b.onPress)}
          />
        ))}
      </View>
    </Animated.View>
  );
}

function DialogButtonView({
  button,
  primary,
  flex,
  onPress,
}: {
  button: DialogButton;
  primary: boolean;
  flex: boolean;
  onPress: () => void;
}) {
  const danger = button.style === 'destructive';
  const look = danger
    ? { bg: DARK.error, fg: DARK.onAccent, border: DARK.error }
    : primary
      ? { bg: DARK.accent, fg: DARK.onAccent, border: DARK.accent }
      : { bg: DARK.raised, fg: DARK.text, border: DARK.hairline };
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flex: flex ? 1 : undefined,
        minHeight: 50,
        paddingHorizontal: SPACE.md,
        borderRadius: RADIUS.md + 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: look.bg,
        borderWidth: 1,
        borderColor: look.border,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      <Text
        numberOfLines={2}
        style={{ color: look.fg, fontWeight: '800', fontSize: 15.5, textAlign: 'center' }}
      >
        {button.text}
      </Text>
    </Pressable>
  );
}

function MenuSheet({
  req,
  anim,
  reduced,
}: {
  req: Extract<Request, { kind: 'menu' }>;
  anim: Animated.Value;
  reduced: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Animated.View
      accessibilityViewIsModal
      style={{
        alignSelf: 'stretch',
        paddingHorizontal: SPACE.md,
        paddingBottom: insets.bottom + SPACE.md,
        gap: SPACE.sm,
        transform: reduced
          ? []
          : [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [320, 0] }) }],
      }}
    >
      <View style={{ borderRadius: RADIUS.xl, backgroundColor: DARK.card, overflow: 'hidden' }}>
        <View style={{ alignItems: 'center', paddingTop: SPACE.sm }}>
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: DARK.border }} />
        </View>
        <Text
          accessibilityRole="header"
          numberOfLines={1}
          style={[
            TYPE.overline,
            {
              color: DARK.textMuted,
              textAlign: 'center',
              paddingHorizontal: SPACE.lg,
              paddingTop: SPACE.md,
              paddingBottom: SPACE.sm,
            },
          ]}
        >
          {req.title}
        </Text>
        {req.items.map((item, i) => (
          <Pressable
            key={`${item.label}${i}`}
            accessibilityRole="button"
            onPress={() => close(item.onPress)}
            style={({ pressed }) => ({
              minHeight: 56,
              flexDirection: 'row',
              alignItems: 'center',
              gap: SPACE.md,
              paddingHorizontal: SPACE.lg + 2,
              borderTopWidth: 1,
              borderTopColor: DARK.hairline,
              backgroundColor: pressed ? DARK.raised : 'transparent',
            })}
          >
            <View
              style={{
                width: 34,
                height: 34,
                borderRadius: 10,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: item.destructive ? DARK.errorSoft : DARK.raised,
              }}
            >
              <Ionicons
                name={item.icon ?? (item.destructive ? 'alert-circle-outline' : 'ellipse-outline')}
                size={18}
                color={item.destructive ? DARK.error : DARK.text}
              />
            </View>
            <Text
              style={{
                flex: 1,
                fontSize: 16,
                fontWeight: '700',
                color: item.destructive ? DARK.error : DARK.text,
              }}
            >
              {item.label}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        onPress={() => close()}
        style={({ pressed }) => ({
          minHeight: 56,
          borderRadius: RADIUS.xl,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: pressed ? DARK.raised : DARK.card,
        })}
      >
        <Text style={{ fontSize: 16, fontWeight: '800' }}>Cancel</Text>
      </Pressable>
    </Animated.View>
  );
}
