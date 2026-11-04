import {
  Children,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ComponentRef,
  type ReactNode,
  type RefObject,
} from 'react';
import {
  ActivityIndicator,
  Animated,
  Image,
  Keyboard,
  LayoutAnimation,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import MARK from '../assets/brand-mark.png';
import { DARK } from '@jax/shared';
import { UserBadge } from './auth/UserBadge';
import { Bell } from './social/Bell';
import { MessagesButton } from './social/MessagesButton';
import { showMenu, type MenuItem } from './dialog';
import { haptic, useReducedMotion } from './motion';
import { DecoBox, StepEdge } from './deco';
import { FONT, Text, TextInput } from './text';
import { elevation, GUTTER, RADIUS, SPACE, TYPE } from './tokens';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/* ------------------------------------------------------------------ brand + header */

/**
 * D79: the app name, always top-left in the header on every screen (with the back arrow
 * before it on inner screens). The app icon (a simplified version that stays readable when
 * small, assets/brand/mark-small.svg) and the name in capitals, JAX in teal and SIDE in
 * white, set in Russo One (D120). The loading screen and sign-in use the drawn emblem
 * instead (src/brand/Emblem.tsx).
 */
export function BrandMark() {
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel="JaxSide"
      style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
    >
      <Image source={MARK} style={{ width: 30, height: 30, borderRadius: 8 }} />
      <Text style={{ fontFamily: FONT.brand, fontSize: 22 }}>
        <Text style={{ color: DARK.accent }}>JAX</Text>
        <Text style={{ color: DARK.text }}>SIDE</Text>
      </Text>
    </View>
  );
}

/**
 * Navigation header (D33, D79): black bar, the JaxSide mark on the left on every screen (no
 * centered page names), the accent back arrow, and messages and notifications on the right
 * (D119: no username there; a GUEST pill for guests).
 * The page's own name is shown inside the page with `PageTitle`.
 */
export const headerOptions = {
  headerTitle: () => <BrandMark />,
  headerTitleAlign: 'left' as const,
  // D76 / D119: messages and the notification bell (plus the GUEST pill for guests).
  headerRight: () => (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <MessagesButton />
      <Bell />
      <UserBadge />
    </View>
  ),
  headerStyle: { backgroundColor: DARK.bar },
  headerShadowVisible: false,
  headerBackButtonDisplayMode: 'minimal' as const,
  headerTintColor: DARK.accent,
  contentStyle: { backgroundColor: DARK.page },
};

/** D79: the big page name at the top of inner screens, with an optional line under it. */
export function PageTitle({
  title,
  subtitle,
  icon,
  inline = true,
}: {
  title: string;
  subtitle?: string;
  icon?: IconName;
  /** D88 / D93: the icon tile beside the title (every page now); `false` stacks it above. */
  inline?: boolean;
}) {
  if (inline) {
    return (
      <View style={{ marginBottom: SPACE.xl - 4, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.md }}>
          {icon ? (
            <View
              style={{
                width: 44,
                height: 44,
                borderRadius: 13,
                backgroundColor: DARK.raised,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name={icon} size={22} color={DARK.accent} />
            </View>
          ) : null}
          <Text accessibilityRole="header" style={[TYPE.title, { flexShrink: 1 }]}>
            {title}
          </Text>
        </View>
        {subtitle ? (
          <Text style={[TYPE.callout, { color: DARK.textMuted }]}>{subtitle}</Text>
        ) : null}
      </View>
    );
  }
  return (
    <View style={{ marginBottom: SPACE.xl - 4, gap: 6 }}>
      {icon ? (
        <View
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            backgroundColor: DARK.raised,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 6,
          }}
        >
          <Ionicons name={icon} size={24} color={DARK.accent} />
        </View>
      ) : null}
      <Text accessibilityRole="header" style={TYPE.title}>
        {title}
      </Text>
      {subtitle ? <Text style={[TYPE.callout, { color: DARK.textMuted }]}>{subtitle}</Text> : null}
    </View>
  );
}

/**
 * D79: every inner screen sits in this: the dark page background, the standard padding,
 * scrolling, and (for forms) room for the keyboard.
 */
export function Screen({
  children,
  keyboard = true,
  scroll = true,
  padded = true,
  step = true,
}: {
  children: ReactNode;
  keyboard?: boolean;
  scroll?: boolean;
  padded?: boolean;
  /** D127: the icon's stepped edge under the black header. */
  step?: boolean;
}) {
  const pad = padded ? { padding: GUTTER, paddingBottom: 48 } : null;
  const body = scroll ? (
    <ScrollView
      style={{ flex: 1, backgroundColor: DARK.page }}
      contentContainerStyle={[pad, { flexGrow: 1 }]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1, backgroundColor: DARK.page }, pad]}>{children}</View>
  );
  const stepped = step ? (
    <View style={{ flex: 1, backgroundColor: DARK.page }}>
      <StepEdge />
      {body}
    </View>
  ) : (
    body
  );
  return keyboard ? (
    <KeyboardSafeView style={{ backgroundColor: DARK.page }}>{stepped}</KeyboardSafeView>
  ) : (
    stepped
  );
}

/**
 * D81 / D192: how much of `ref`'s view the keyboard covers (0 when it is closed), so the view can
 * add that much space at its bottom. Shared by KeyboardSafeView (screens) and Sheet (pop-up
 * sheets), so every place you can type stays above the keyboard.
 */
function useKeyboardInset(ref: RefObject<ComponentRef<typeof View> | null>) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const ios = Platform.OS === 'ios';
    const show = Keyboard.addListener(ios ? 'keyboardWillShow' : 'keyboardDidShow', (e) => {
      const keyboardTop = e.endCoordinates.screenY;
      ref.current?.measureInWindow((_x, y, _w, h) => {
        if (ios) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setInset(Math.max(0, y + h - keyboardTop));
      });
    });
    const hide = Keyboard.addListener(ios ? 'keyboardWillHide' : 'keyboardDidHide', () => {
      if (ios) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
      setInset(0);
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [ref]);
  return inset;
}

/**
 * D81: keeps what you're typing above the keyboard on both Android and iPhone. When the
 * keyboard opens it measures how much of this view the keyboard covers and adds that much
 * space at the bottom, so the content (e.g. the comment box) sits right on top of the
 * keyboard. React Native's KeyboardAvoidingView doesn't do this on Android now that Expo
 * draws apps edge to edge (the phone no longer shrinks the screen for the keyboard).
 */
export function KeyboardSafeView({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const inset = useKeyboardInset(ref);
  return (
    <View ref={ref} style={[{ flex: 1 }, style]}>
      <View style={{ flex: 1 }}>{children}</View>
      <View style={{ height: inset }} />
    </View>
  );
}

/** D79 / D127: a card on the page, with clipped (art deco) corners. */
export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const bg = (StyleSheet.flatten(style)?.backgroundColor as string | undefined) ?? DARK.card;
  return (
    <DecoBox shape="chamfer" fill={bg} style={[{ padding: SPACE.lg }, style]}>
      {children}
    </DecoBox>
  );
}

/* ------------------------------------------------------------------------ press */

/**
 * A Pressable that shrinks slightly while pressed (springs back on release). With reduce
 * motion on it dims instead. `containerStyle` positions the touch area; `style` is drawn.
 */
export function PressableScale({
  scaleTo = 0.96,
  style,
  containerStyle,
  children,
  onPressIn,
  onPressOut,
  ...rest
}: Omit<PressableProps, 'style' | 'children'> & {
  scaleTo?: number;
  style?: StyleProp<ViewStyle>;
  containerStyle?: StyleProp<ViewStyle>;
  children?: ReactNode;
}) {
  const reduced = useReducedMotion();
  const scale = useRef(new Animated.Value(1)).current;
  const to = (v: number) =>
    Animated.spring(scale, { toValue: v, useNativeDriver: true, speed: 40, bounciness: 6 }).start();
  return (
    <Pressable
      {...rest}
      style={containerStyle}
      onPressIn={(e) => {
        if (!reduced) to(scaleTo);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        if (!reduced) to(1);
        onPressOut?.(e);
      }}
    >
      {({ pressed }) => (
        <Animated.View
          style={[style, { transform: [{ scale }] }, reduced && pressed ? { opacity: 0.7 } : null]}
        >
          {children}
        </Animated.View>
      )}
    </Pressable>
  );
}

/* ------------------------------------------------------------------------ forms */

function FieldMessage({ error, hint }: { error?: string; hint?: string }) {
  if (error) {
    return (
      <View style={styles.messageRow} accessibilityLiveRegion="polite">
        <Ionicons name="alert-circle" size={15} color={DARK.error} />
        <Text style={[styles.error, { marginTop: 0, flex: 1 }]}>{error}</Text>
      </View>
    );
  }
  return hint ? <Text style={styles.hint}>{hint}</Text> : null;
}

/** A labeled text field: filled dark box with an optional icon, gold outline while typing. */
export function Field({
  label,
  error,
  hint,
  icon,
  onFocus,
  onBlur,
  style,
  ...input
}: TextInputProps & { label: string; error?: string; hint?: string; icon?: IconName }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={{ justifyContent: 'center' }}>
        <TextInput
          accessibilityLabel={label}
          {...input}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            icon ? { paddingLeft: 44 } : null,
            focused ? styles.inputFocused : null,
            error ? styles.inputError : null,
            style,
          ]}
        />
        {icon ? (
          <Ionicons
            name={icon}
            size={19}
            color={focused ? DARK.accent : DARK.textMuted}
            style={styles.fieldIcon}
            pointerEvents="none"
          />
        ) : null}
      </View>
      <FieldMessage error={error} hint={hint} />
    </View>
  );
}

/**
 * Password input with a show/hide eye inside the field. Capitalization, autocorrect and
 * spellcheck are off: on Android the keyboard can otherwise silently capitalize the first
 * character of a hidden field, so the saved password differs from what the user meant.
 */
export function PasswordField({
  label,
  error,
  hint,
  onFocus,
  onBlur,
  ...input
}: Omit<TextInputProps, 'secureTextEntry'> & { label: string; error?: string; hint?: string }) {
  const [visible, setVisible] = useState(false);
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={{ justifyContent: 'center' }}>
        <TextInput
          accessibilityLabel={label}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          {...input}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[
            styles.input,
            { paddingLeft: 44, paddingRight: 52 },
            focused ? styles.inputFocused : null,
            error ? styles.inputError : null,
          ]}
        />
        <Ionicons
          name="lock-closed-outline"
          size={19}
          color={focused ? DARK.accent : DARK.textMuted}
          style={styles.fieldIcon}
          pointerEvents="none"
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? `Hide ${label}` : `Show ${label}`}
          onPress={() => setVisible((v) => !v)}
          style={styles.showButton}
        >
          <Ionicons
            name={visible ? 'eye-off-outline' : 'eye-outline'}
            size={21}
            color={DARK.textMuted}
          />
        </Pressable>
      </View>
      <FieldMessage error={error} hint={hint} />
    </View>
  );
}

type ButtonVariant =
  'primary' | 'accent' | 'secondary' | 'teal' | 'danger' | 'link' | 'linkOnDark' | 'ghostOnDark';

const SECONDARY = {
  box: { backgroundColor: DARK.raised, borderWidth: 1, borderColor: DARK.hairline },
  text: DARK.text,
};

const BUTTON_LOOK: Record<ButtonVariant, { box: ViewStyle; text: string }> = {
  // Gold with black text (D33): the main action on every screen.
  primary: { box: { backgroundColor: DARK.accent }, text: DARK.onAccent },
  accent: { box: { backgroundColor: DARK.accent }, text: DARK.onAccent },
  secondary: SECONDARY,
  ghostOnDark: SECONDARY,
  teal: { box: { backgroundColor: DARK.teal }, text: DARK.onTeal },
  danger: {
    box: { backgroundColor: DARK.errorSoft, borderWidth: 1, borderColor: DARK.error },
    text: DARK.error,
  },
  link: { box: {}, text: DARK.accent },
  linkOnDark: { box: {}, text: DARK.accent },
};

/**
 * Buttons (D79): `primary` is gold with black text; `secondary` a raised dark button;
 * `teal`; `danger` red outline; `link` gold text. Filled ones are 52 tall and shrink a
 * little when pressed; links are 44 tall.
 */
export function Button({
  title,
  onPress,
  busy,
  disabled,
  variant = 'primary',
  icon,
  size = 'md',
  style,
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  variant?: ButtonVariant;
  icon?: IconName;
  size?: 'md' | 'sm';
  style?: StyleProp<ViewStyle>;
}) {
  const look = BUTTON_LOOK[variant];
  const isLink = variant === 'link' || variant === 'linkOnDark';
  const off = !!busy || !!disabled;
  const content = busy ? (
    <ActivityIndicator color={look.text} />
  ) : (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACE.sm }}>
      {icon ? <Ionicons name={icon} size={size === 'sm' ? 16 : 19} color={look.text} /> : null}
      {/* D131: one line; shrinks a little rather than wrapping in a narrow button. */}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.85}
        style={{ color: look.text, fontWeight: '800', fontSize: size === 'sm' ? 14 : 16 }}
      >
        {title}
      </Text>
    </View>
  );

  if (isLink) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ busy: !!busy, disabled: off }}
        disabled={off}
        onPress={onPress}
        style={({ pressed }) => [styles.link, { opacity: pressed ? 0.6 : off ? 0.5 : 1 }, style]}
      >
        {content}
      </Pressable>
    );
  }
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityState={{ busy: !!busy, disabled: off }}
      disabled={off}
      onPress={onPress}
      containerStyle={[{ marginTop: SPACE.sm }, style]}
      style={disabled && !busy ? { opacity: 0.4 } : null}
    >
      {/* D127: arrow-ended (art deco) instead of rounded. */}
      <DecoBox
        shape="arrow"
        fill={(look.box.backgroundColor as string | undefined) ?? 'transparent'}
        stroke={look.box.borderColor as string | undefined}
        strokeWidth={(look.box.borderWidth as number | undefined) ?? 1}
        style={[styles.button, size === 'sm' && { minHeight: 40, paddingHorizontal: SPACE.lg }]}
      >
        {content}
      </DecoBox>
    </PressableScale>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <View style={styles.formError} accessibilityRole="alert">
      <Ionicons name="alert-circle" size={20} color={DARK.error} />
      <Text style={[TYPE.callout, { flex: 1, fontWeight: '600' }]}>{children}</Text>
    </View>
  );
}

/**
 * Notice (D79): a tinted box with an icon and a colored left edge. `info` is gold,
 * `success` teal, `error` red. Tappable when `onPress` is given (shows a chevron).
 */
export function Banner({
  children,
  icon = 'information-circle',
  tone = 'info',
  onPress,
  style,
}: {
  children: ReactNode;
  icon?: IconName;
  tone?: 'info' | 'success' | 'error';
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const look = {
    info: { bg: DARK.accentSoft, fg: DARK.accent },
    success: { bg: DARK.tealSoft, fg: DARK.tealText },
    error: { bg: DARK.errorSoft, fg: DARK.error },
  }[tone];
  const body = (
    <View
      style={[
        styles.banner,
        styles.bannerRow,
        { backgroundColor: look.bg, borderLeftColor: look.fg },
        style,
      ]}
    >
      <Ionicons name={icon} size={20} color={look.fg} />
      <View style={{ flex: 1 }}>
        {typeof children === 'string' ? <Text style={TYPE.callout}>{children}</Text> : children}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={look.fg} /> : null}
    </View>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      {body}
    </Pressable>
  ) : (
    body
  );
}

/** Switch colors: teal when on (D33). */
export const switchColors = {
  trackColor: { false: DARK.raised, true: DARK.teal },
  thumbColor: DARK.text,
  ios_backgroundColor: DARK.raised,
};

export const styles = StyleSheet.create({
  screen: { padding: GUTTER, gap: SPACE.xs },
  title: { ...TYPE.title, marginBottom: SPACE.sm },
  body: { ...TYPE.body, color: DARK.text },
  muted: { color: DARK.textMuted },
  hint: { ...TYPE.caption, color: DARK.textMuted, marginTop: SPACE.xs + 2 },
  field: { marginBottom: SPACE.lg },
  label: { ...TYPE.label, color: DARK.text, marginBottom: SPACE.sm },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: DARK.border,
    borderRadius: RADIUS.md,
    backgroundColor: DARK.raised,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
  },
  inputFocused: { borderColor: DARK.accent, borderWidth: 2, margin: -1 },
  inputError: { borderColor: DARK.error },
  fieldIcon: { position: 'absolute', left: 14 },
  messageRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: SPACE.xs + 2 },
  showButton: {
    position: 'absolute',
    right: 2,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { ...TYPE.caption, color: DARK.error, marginTop: SPACE.xs },
  formError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    backgroundColor: DARK.errorSoft,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    marginBottom: SPACE.md,
  },
  button: {
    minHeight: 52,
    borderRadius: RADIUS.md + 2,
    paddingHorizontal: SPACE.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  link: {
    minHeight: 44,
    paddingHorizontal: SPACE.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: { color: DARK.accent, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginVertical: 6 },
  banner: {
    borderLeftWidth: 4,
    padding: SPACE.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACE.md,
  },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});

/* ---------------------------------------------------------------- choice controls */

/** Chip (D79): raised dark pill; selected = gold with black text (D33); removable with ×. */
export function Chip({
  label,
  active,
  onPress,
  icon,
  iconColor,
  onRemove,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: IconName;
  /** Icon color when not selected (e.g. a category color). */
  iconColor?: string;
  onRemove?: () => void;
  /** Kept for older call sites; every chip is dark now. */
  dark?: boolean;
}) {
  const fg = active ? DARK.onAccent : DARK.text;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityHint={onRemove ? 'Removes this filter' : undefined}
      onPress={() => {
        haptic.select();
        (onRemove ?? onPress)();
      }}
      hitSlop={4}
      style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
    >
      <DecoBox
        shape="arrow"
        cut={9}
        fill={active ? DARK.accent : DARK.raised}
        stroke={active ? DARK.accent : DARK.hairline}
        style={{
          minHeight: 38,
          paddingHorizontal: 16,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 7,
        }}
      >
        {icon ? <Ionicons name={icon} size={15} color={active ? fg : (iconColor ?? fg)} /> : null}
        <Text style={{ color: fg, fontWeight: '700', fontSize: 14 }}>{label}</Text>
        {onRemove ? <Ionicons name="close" size={15} color={fg} /> : null}
      </DecoBox>
    </Pressable>
  );
}

/** Segmented control (D79): a pill track with the selected option in gold. */
export function Segmented({
  options,
  value,
  onChange,
  stretch = false,
  small = false,
  compact = false,
}: {
  options: { key: string; label: string; icon?: IconName }[];
  value: string;
  onChange: (key: string) => void;
  /** Fill the width, equal parts. */
  stretch?: boolean;
  /** Smaller text and icons, so longer labels fit their pill. */
  small?: boolean;
  /** D128: shorter and smaller text (Latest / Top next to the refresh button). */
  compact?: boolean;
  /** Kept for older call sites; every control is dark now. */
  dark?: boolean;
}) {
  return (
    <DecoBox
      accessibilityRole="tablist"
      shape="arrow"
      cut={12}
      fill={DARK.raised}
      style={{
        flexDirection: 'row',
        padding: 3,
        paddingHorizontal: 8,
        alignSelf: stretch ? 'stretch' : 'flex-start',
      }}
    >
      {options.map((o) => {
        const active = o.key === value;
        const fg = active ? DARK.onAccent : DARK.textMuted;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) haptic.select();
              onChange(o.key);
            }}
            style={{ flex: stretch ? 1 : undefined }}
          >
            <DecoBox
              shape="arrow"
              cut={10}
              fill={active ? DARK.accent : 'transparent'}
              style={{
                minHeight: compact ? 28 : 36,
                paddingHorizontal: small || compact ? 10 : 16,
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'row',
                gap: small ? 4 : 6,
              }}
            >
              {o.icon ? (
                <Ionicons name={o.icon} size={compact ? 12 : small ? 13 : 15} color={fg} />
              ) : null}
              <Text
                numberOfLines={1}
                style={{
                  color: fg,
                  fontFamily: FONT.deco,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  fontSize: compact ? 10.5 : small ? 11.5 : 12.5,
                }}
              >
                {o.label}
              </Text>
            </DecoBox>
          </Pressable>
        );
      })}
    </DecoBox>
  );
}

/** Round icon button. `active` turns the icon gold and adds a gold dot (filters on). */
export function IconButton({
  icon,
  label,
  onPress,
  busy,
  active = false,
  size = 44,
}: {
  icon: IconName;
  /** Read by screen readers. */
  label: string;
  onPress: () => void;
  busy?: boolean;
  active?: boolean;
  size?: number;
  /** Kept for older call sites. */
  dark?: boolean;
}) {
  const color = active ? DARK.accent : DARK.text;
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: !!busy, selected: active }}
      disabled={busy}
      onPress={onPress}
      hitSlop={4}
      scaleTo={0.9}
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: DARK.raised,
      }}
    >
      {busy ? (
        <ActivityIndicator color={color} />
      ) : (
        <Ionicons name={icon} size={Math.round(size * 0.48)} color={color} />
      )}
      {active ? (
        <View
          style={{
            position: 'absolute',
            top: 7,
            right: 7,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: DARK.accent,
            borderWidth: 2,
            borderColor: DARK.raised,
          }}
        />
      ) : null}
    </PressableScale>
  );
}

/**
 * D73: refresh button. Shows a spinner while busy. D128: a small one sits next to the
 * Latest / Top switch (Home) and on a place's Discussion title, since it updates the posts.
 */
export function RefreshButton({
  onPress,
  busy,
  size = 44,
}: {
  onPress: () => void;
  busy?: boolean;
  size?: number;
}) {
  return (
    <IconButton icon="refresh" label="Refresh posts" onPress={onPress} busy={busy} size={size} />
  );
}

/** Search box: a raised pill with a magnifier and a clear (×) button once something is typed. */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  label,
  maxLength,
  autoCapitalize = 'none',
  compact = false,
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  label: string;
  maxLength?: number;
  autoCapitalize?: TextInputProps['autoCapitalize'];
  /** D132: a shorter box (Home), so the posts start higher. */
  compact?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <DecoBox
      shape="chamfer"
      cut={9}
      fill={DARK.raised}
      stroke={focused ? DARK.accent : undefined}
      strokeWidth={1.5}
      // Grows to fill a row, but keeps its own height when stacked (`flex: 1` would
      // collapse it to nothing in a column).
      style={{
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: 'auto',
        height: compact ? 38 : 44,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 14,
      }}
    >
      <Ionicons name="search" size={18} color={focused ? DARK.accent : DARK.textMuted} />
      <TextInput
        accessibilityLabel={label}
        placeholder={placeholder}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCorrect={false}
        autoCapitalize={autoCapitalize}
        returnKeyType="search"
        maxLength={maxLength}
        numberOfLines={1}
        // D100: React Native can't size the placeholder on its own, so the box uses a smaller
        // size while it's empty (the placeholder fits) and the normal size once you type.
        style={{
          flex: 1,
          fontSize: value ? 15.5 : 13.5,
          paddingHorizontal: 8,
          paddingVertical: 0,
        }}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChangeText('')}
          style={{
            width: 44,
            height: compact ? 38 : 44,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="close-circle" size={19} color={DARK.textMuted} />
        </Pressable>
      ) : null}
    </DecoBox>
  );
}

/**
 * The floating action button, bottom-right (D70): gold with black text and icon (D33). D162: a
 * pill that says what it does ("Add Post", "Add Place", "Add Topic") instead of a bare +.
 */
export function FloatingButton({
  title,
  label,
  onPress,
  icon = 'add',
}: {
  /** The words on the button, e.g. "Add Post". */
  title: string;
  /** Read by screen readers ("Write a new post", "Add new place"). */
  label: string;
  onPress: () => void;
  icon?: IconName;
}) {
  return (
    <PressableScale
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        haptic.tap();
        onPress();
      }}
      scaleTo={0.9}
      containerStyle={{ position: 'absolute', right: 18, bottom: 22 }}
      style={{
        height: 52,
        borderRadius: 26,
        paddingLeft: 16,
        paddingRight: 20,
        flexDirection: 'row',
        gap: 6,
        backgroundColor: DARK.accent,
        alignItems: 'center',
        justifyContent: 'center',
        ...elevation(2),
      }}
    >
      <Ionicons name={icon} size={24} color={DARK.onAccent} />
      <Text style={{ color: DARK.onAccent, fontSize: 16, fontWeight: '800' }}>{title}</Text>
    </PressableScale>
  );
}

/* --------------------------------------------------------------- states + feedback */

/** Empty state: an icon in a soft circle, a short title, one line of help, one action. */
export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void; icon?: IconName };
  /** Kept for older call sites. */
  dark?: boolean;
}) {
  return (
    <View
      style={{
        alignItems: 'center',
        paddingHorizontal: SPACE.xxl,
        paddingVertical: 48,
        gap: SPACE.md,
      }}
    >
      <View
        style={{
          width: 84,
          height: 84,
          borderRadius: 42,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: DARK.card,
          borderWidth: 1,
          borderColor: DARK.hairline,
        }}
      >
        <Ionicons name={icon} size={38} color={DARK.accent} />
      </View>
      <Text accessibilityRole="header" style={[TYPE.headline, { textAlign: 'center' }]}>
        {title}
      </Text>
      {body ? (
        <Text style={[TYPE.callout, { textAlign: 'center', color: DARK.textMuted }]}>{body}</Text>
      ) : null}
      {action ? <Button title={action.label} icon={action.icon} onPress={action.onPress} /> : null}
    </View>
  );
}

/** A load error with Try again (location problems, no connection, …). */
export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
  /** Kept for older call sites. */
  dark?: boolean;
}) {
  return (
    <View
      accessibilityRole="alert"
      style={{
        marginHorizontal: SPACE.md,
        marginVertical: SPACE.sm,
        padding: SPACE.lg,
        borderRadius: RADIUS.lg,
        backgroundColor: DARK.errorSoft,
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.md,
      }}
    >
      <Ionicons name="cloud-offline-outline" size={24} color={DARK.error} />
      <Text style={[TYPE.callout, { flex: 1 }]}>{message}</Text>
      {onRetry ? (
        <Button
          variant="link"
          title="Try again"
          onPress={onRetry}
          style={{ paddingHorizontal: 0 }}
        />
      ) : null}
    </View>
  );
}

/** Loading placeholder that gently pulses (holds still when reduce motion is on). */
export function Pulse({ children }: { children: ReactNode }) {
  const reduced = useReducedMotion();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.45, duration: 700, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduced]);
  return (
    <Animated.View accessibilityLabel="Loading" accessibilityRole="progressbar" style={{ opacity }}>
      {children}
    </Animated.View>
  );
}

/** One grey shape inside a `Pulse`. */
export function Bone({
  w,
  h,
  r = 6,
  style,
}: {
  w: number | `${number}%`;
  h: number;
  r?: number;
  /** Kept for older call sites. */
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[{ width: w, height: h, borderRadius: r, backgroundColor: DARK.raised }, style]} />
  );
}

/**
 * A short message that slides up near the bottom and fades ("Added to favorites"). Render
 * `node` last inside the screen's root view; call `show(text)`.
 */
export function useToast() {
  const [toast, setToast] = useState<{ text: string; icon: IconName }>();
  const anim = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const reduced = useReducedMotion();

  const show = useCallback(
    (text: string, icon: IconName = 'checkmark-circle') => {
      clearTimeout(timer.current);
      setToast({ text, icon });
      anim.setValue(0);
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 18 }).start();
      timer.current = setTimeout(() => {
        Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }).start(() =>
          setToast(undefined),
        );
      }, 1800);
    },
    [anim],
  );
  useEffect(() => () => clearTimeout(timer.current), []);

  const node = toast ? (
    <Animated.View
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{
        position: 'absolute',
        bottom: 104,
        alignSelf: 'center',
        opacity: anim,
        transform: reduced
          ? []
          : [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
        // Inverted (light pill, dark text) so it stands out on the dark screens.
        backgroundColor: DARK.text,
        borderRadius: RADIUS.pill,
        paddingHorizontal: 18,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.sm,
        ...elevation(3),
      }}
    >
      <Ionicons name={toast.icon} size={18} color={DARK.page} />
      <Text style={{ color: DARK.page, fontWeight: '800' }}>{toast.text}</Text>
    </Animated.View>
  ) : null;

  return { node, show };
}

/**
 * Bottom sheet: dimmed background (tap to close), rounded top with a grab handle, an
 * optional title with a close button, and room for the phone's bottom edge.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const slide = useRef(new Animated.Value(0)).current;
  const rootRef = useRef<ComponentRef<typeof View>>(null);
  // D192: a sheet with a text box (edit a post, report) rises above the keyboard; otherwise
  // the keyboard hides what you type until it is closed.
  const keyboard = useKeyboardInset(rootRef);
  useEffect(() => {
    if (!open) return;
    slide.setValue(reduced ? 1 : 0);
    if (!reduced) {
      Animated.spring(slide, {
        toValue: 1,
        useNativeDriver: true,
        speed: 16,
        bounciness: 3,
      }).start();
    }
  }, [open, reduced, slide]);

  return (
    <Modal
      visible={open}
      animationType="fade"
      transparent
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View ref={rootRef} style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: DARK.scrim }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <Animated.View
          style={{
            backgroundColor: DARK.card,
            borderTopLeftRadius: RADIUS.xl,
            borderTopRightRadius: RADIUS.xl,
            // The keyboard covers the phone's bottom edge, so no extra room for it then.
            paddingBottom: (keyboard > 0 ? 0 : insets.bottom) + SPACE.md,
            maxHeight: '88%',
            flexShrink: 1,
            transform: [
              { translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [400, 0] }) },
            ],
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 40,
              height: 5,
              borderRadius: 3,
              backgroundColor: DARK.border,
              marginTop: SPACE.sm,
              marginBottom: title ? 0 : SPACE.sm,
            }}
          />
          {title ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingLeft: SPACE.xl - 4,
                paddingRight: SPACE.sm,
              }}
            >
              <Text accessibilityRole="header" style={[TYPE.headline, { flex: 1 }]}>
                {title}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close"
                onPress={onClose}
                style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}
              >
                <Ionicons name="close" size={24} color={DARK.textMuted} />
              </Pressable>
            </View>
          ) : null}
          {children}
        </Animated.View>
        <View style={{ height: keyboard }} />
      </View>
    </Modal>
  );
}

/* -------------------------------------------------------------------- lists */

/** A group of rows on a rounded card, with a small caps title above and help text below. */
export function ListGroup({
  title,
  footer,
  children,
  first = false,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
  /** No space above (first thing on the page). */
  first?: boolean;
}) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={{ marginTop: first ? 0 : SPACE.xl }}>
      {title ? (
        <Text
          accessibilityRole="header"
          style={[
            TYPE.overline,
            { color: DARK.textMuted, marginLeft: SPACE.xs, marginBottom: SPACE.sm },
          ]}
        >
          {title}
        </Text>
      ) : null}
      <DecoBox shape="chamfer" fill={DARK.card}>
        {rows.map((row, i) => (
          <View key={i}>
            {i > 0 ? (
              <View style={{ height: 1, backgroundColor: DARK.hairline, marginLeft: 62 }} />
            ) : null}
            {row}
          </View>
        ))}
      </DecoBox>
      {footer ? (
        <Text
          style={[
            TYPE.caption,
            { color: DARK.textMuted, marginHorizontal: SPACE.xs, marginTop: SPACE.sm },
          ]}
        >
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

/** One row in a `ListGroup`: icon tile, label (and detail), value, chevron when it opens. */
export function ListRow({
  icon,
  iconColor,
  label,
  detail,
  value,
  href,
  onPress,
  tone = 'default',
  right,
}: {
  icon?: IconName;
  /** Tile color (e.g. a place's category color; the icon is white on it). */
  iconColor?: string;
  label: string;
  detail?: string;
  value?: string;
  href?: Href;
  onPress?: () => void;
  tone?: 'default' | 'danger' | 'primary';
  right?: ReactNode;
}) {
  const action = onPress ?? (href ? () => router.push(href) : undefined);
  const labelColor = tone === 'danger' ? DARK.error : tone === 'primary' ? DARK.accent : DARK.text;
  const iconFg = iconColor
    ? DARK.onTeal
    : tone === 'danger'
      ? DARK.error
      : tone === 'primary'
        ? DARK.accent
        : DARK.text;
  const inner = (
    <>
      {icon ? (
        <View
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: iconColor ?? (tone === 'danger' ? DARK.errorSoft : DARK.raised),
          }}
        >
          <Ionicons name={icon} size={18} color={iconFg} />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text
          numberOfLines={1}
          style={[TYPE.body, { color: labelColor, fontWeight: tone === 'default' ? '600' : '800' }]}
        >
          {label}
        </Text>
        {detail ? <Text style={[TYPE.caption, { color: DARK.textMuted }]}>{detail}</Text> : null}
      </View>
      {value ? (
        <Text numberOfLines={1} style={[TYPE.callout, { color: DARK.textMuted, maxWidth: '45%' }]}>
          {value}
        </Text>
      ) : null}
      {right}
      {action && tone === 'default' ? (
        <Ionicons name="chevron-forward" size={18} color={DARK.textMuted} />
      ) : null}
    </>
  );
  const row: ViewStyle = {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
  };
  return action ? (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={value ? `${label}, ${value}` : label}
      onPress={action}
      android_ripple={{ color: DARK.raised }}
      style={({ pressed }) => [row, pressed && { backgroundColor: DARK.raised }]}
    >
      {inner}
    </Pressable>
  ) : (
    <View style={row}>{inner}</View>
  );
}

/** A small caps section title ("Comments · 4"), optionally with something on the right. */
export function SectionTitle({
  children,
  action,
  center = false,
}: {
  children: ReactNode;
  action?: ReactNode;
  /** D129: centered, with no outer margins (e.g. "Near you" on Home). */
  center?: boolean;
  /** Kept for older call sites. */
  dark?: boolean;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: center ? 0 : SPACE.lg,
        marginTop: center ? 0 : SPACE.lg,
        marginBottom: center ? 0 : SPACE.sm,
        minHeight: 24,
      }}
    >
      {/* D127: art deco section title: spaced capitals between small diamonds. */}
      <View
        style={{
          flex: 1,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: center ? 'center' : 'flex-start',
          gap: 8,
        }}
      >
        <Text style={{ color: DARK.accent, fontSize: 8 }}>◆</Text>
        <Text
          accessibilityRole="header"
          style={{
            color: DARK.accent,
            fontFamily: FONT.deco,
            textTransform: 'uppercase',
            letterSpacing: 2,
            fontSize: 12.5,
          }}
        >
          {children}
        </Text>
        <Text style={{ color: DARK.accent, fontSize: 8 }}>◆</Text>
      </View>
      {action}
    </View>
  );
}

/** A small stat: icon, value and label stacked (place page, profile). */
export function StatTile({
  icon,
  value,
  label,
  color = DARK.accent,
}: {
  icon: IconName;
  value: string;
  label: string;
  color?: string;
}) {
  return (
    <View
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{
        flex: 1,
        alignItems: 'center',
        gap: 2,
        paddingVertical: SPACE.md,
        borderRadius: RADIUS.md,
        backgroundColor: DARK.raised,
      }}
    >
      <Ionicons name={icon} size={18} color={color} />
      <Text numberOfLines={1} style={{ fontSize: 17, fontWeight: '800', marginTop: 2 }}>
        {value}
      </Text>
      <Text style={[TYPE.caption, { color: DARK.textMuted }]}>{label}</Text>
    </View>
  );
}

/**
 * The "•••" menu (D97): the app's own bottom sheet (`showMenu` in `@/dialog`), on both
 * platforms and with any number of actions.
 */
export function openMenu(title: string, items: MenuItem[]) {
  showMenu(title, items);
}

/** D79: a small status pill: `good` teal, `wait` gold, `neutral` grey. */
export function StatusBadge({
  text,
  tone = 'neutral',
}: {
  text: string;
  tone?: 'good' | 'wait' | 'neutral';
}) {
  const look = {
    good: { bg: DARK.tealSoft, fg: DARK.tealText, icon: 'checkmark-circle' as const },
    wait: { bg: DARK.accentSoft, fg: DARK.accent, icon: 'time' as const },
    neutral: { bg: DARK.raised, fg: DARK.textMuted, icon: 'ellipse' as const },
  }[tone];
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 9,
        height: 24,
        borderRadius: RADIUS.pill,
        backgroundColor: look.bg,
      }}
    >
      <Ionicons name={look.icon} size={12} color={look.fg} />
      <Text style={{ color: look.fg, fontSize: 11.5, fontWeight: '800' }}>{text}</Text>
    </View>
  );
}
