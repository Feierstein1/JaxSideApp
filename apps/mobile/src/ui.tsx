import {
  Children,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from 'react';
import {
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  Animated,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { router, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BRAND, COLORS } from '@jax/shared';
import { UserBadge } from './auth/UserBadge';
import { haptic, useReducedMotion } from './motion';
import { elevation, RADIUS, SPACE, TYPE } from './tokens';

export type IconName = ComponentProps<typeof Ionicons>['name'];

/**
 * D78: a Pressable that shrinks slightly while pressed (springs back on release), the
 * standard "this is tappable" feel. With reduce motion on it dims instead of moving.
 * `containerStyle` positions the touch area; `style` styles what's drawn.
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
          style={[style, { transform: [{ scale }] }, reduced && pressed ? { opacity: 0.75 } : null]}
        >
          {children}
        </Animated.View>
      )}
    </Pressable>
  );
}

function FieldMessage({ error, hint }: { error?: string; hint?: string }) {
  if (error) {
    return (
      <View style={styles.messageRow} accessibilityLiveRegion="polite">
        <Ionicons name="alert-circle" size={15} color={COLORS.error} />
        <Text style={[styles.error, { marginTop: 0, flex: 1 }]}>{error}</Text>
      </View>
    );
  }
  return hint ? <Text style={[styles.hint]}>{hint}</Text> : null;
}

/** A labeled text field. The outline turns teal and thicker while you type in it. */
export function Field({
  label,
  error,
  hint,
  onFocus,
  onBlur,
  style,
  ...input
}: TextInputProps & { label: string; error?: string; hint?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={COLORS.placeholder}
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
          focused ? styles.inputFocused : null,
          error ? styles.inputError : null,
          style,
        ]}
      />
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
      <View style={styles.passwordRow}>
        <TextInput
          accessibilityLabel={label}
          placeholderTextColor={COLORS.placeholder}
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
            styles.passwordInput,
            focused ? styles.inputFocused : null,
            error ? styles.inputError : null,
          ]}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? `Hide ${label}` : `Show ${label}`}
          onPress={() => setVisible((v) => !v)}
          style={styles.showButton}
        >
          <Ionicons
            name={visible ? 'eye-off-outline' : 'eye-outline'}
            size={22}
            color={COLORS.textMuted}
          />
        </Pressable>
      </View>
      <FieldMessage error={error} hint={hint} />
    </View>
  );
}

type ButtonVariant =
  'primary' | 'accent' | 'secondary' | 'danger' | 'link' | 'linkOnDark' | 'ghostOnDark';

const BUTTON_LOOK: Record<ButtonVariant, { box: ViewStyle; text: string }> = {
  primary: { box: { backgroundColor: COLORS.primary }, text: COLORS.onPrimary },
  // Gold always with black text (D33).
  accent: { box: { backgroundColor: COLORS.accent }, text: COLORS.onAccent },
  secondary: {
    box: { backgroundColor: COLORS.background, borderWidth: 1.5, borderColor: COLORS.primary },
    text: COLORS.primary,
  },
  danger: { box: { backgroundColor: COLORS.error }, text: COLORS.onPrimary },
  ghostOnDark: { box: { backgroundColor: COLORS.surfaceDarkRaised }, text: COLORS.onSurfaceDark },
  link: { box: {}, text: COLORS.primary },
  linkOnDark: { box: {}, text: BRAND.gold },
};

/**
 * Buttons (D78): filled ones are 50 tall with rounded corners and shrink a little when
 * pressed; `link` variants are text-only (still 44 tall to tap). `accent` is the gold
 * button (black text).
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
  /** `linkOnDark`: gold link text for the dark-grey backgrounds (D70). */
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
      <Text
        style={{
          color: look.text,
          fontWeight: '700',
          fontSize: size === 'sm' ? 14 : 16,
        }}
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
      style={[
        styles.button,
        size === 'sm' && { minHeight: 40, paddingHorizontal: SPACE.lg },
        look.box,
        disabled && !busy ? { opacity: 0.45 } : null,
      ]}
    >
      {content}
    </PressableScale>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <View style={[styles.formError]} accessibilityRole="alert">
      <Ionicons name="alert-circle" size={18} color={COLORS.error} />
      <Text style={[TYPE.callout, { color: COLORS.error, flex: 1, fontWeight: '600' }]}>
        {children}
      </Text>
    </View>
  );
}

/**
 * Info banner (D78): light gold tint, gold stripe, black text, with an optional icon.
 * Tappable when `onPress` is given (shows a chevron).
 */
export function Banner({
  children,
  icon = 'information-circle',
  onPress,
  style,
}: {
  children: ReactNode;
  icon?: IconName;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const body = (
    <View style={[styles.banner, styles.bannerRow, style]}>
      <Ionicons name={icon} size={20} color={COLORS.text} />
      <View style={{ flex: 1 }}>
        {typeof children === 'string' ? <Text style={styles.body}>{children}</Text> : children}
      </View>
      {onPress ? <Ionicons name="chevron-forward" size={18} color={COLORS.text} /> : null}
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

/**
 * Navigation header (D33, D78): black bar with no line under it (it flows into the black
 * control bar), bold white title, gold back arrow (9.2:1 on black), and the signed-in
 * username on the right (hideable, D43).
 */
export const headerOptions = {
  headerRight: () => <UserBadge />,
  headerTitleAlign: 'center' as const,
  headerStyle: { backgroundColor: COLORS.surfaceInverse },
  headerShadowVisible: false,
  headerBackButtonDisplayMode: 'minimal' as const,
  headerTintColor: BRAND.gold,
  headerTitleStyle: { color: COLORS.onSurfaceInverse, fontWeight: '800' as const, fontSize: 17 },
  contentStyle: { backgroundColor: COLORS.background },
};

/** Switch colors: teal when on. */
export const switchColors = {
  trackColor: { false: COLORS.border, true: COLORS.primary },
  thumbColor: COLORS.background,
};

export const styles = StyleSheet.create({
  screen: { padding: SPACE.xl - 4, gap: SPACE.xs },
  title: { ...TYPE.title, color: COLORS.text, marginBottom: SPACE.sm },
  body: { ...TYPE.body, color: COLORS.text },
  muted: { color: COLORS.textMuted },
  hint: { ...TYPE.caption, color: COLORS.textMuted, marginTop: SPACE.xs + 2 },
  field: { marginBottom: SPACE.lg },
  label: { ...TYPE.label, color: COLORS.text, marginBottom: SPACE.xs + 2 },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    backgroundColor: COLORS.background,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: COLORS.text,
  },
  inputFocused: { borderWidth: 2, borderColor: COLORS.primary, paddingHorizontal: 13 },
  inputError: { borderColor: COLORS.error },
  messageRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: SPACE.xs + 2 },
  passwordRow: { justifyContent: 'center' },
  passwordInput: { paddingRight: 52 },
  showButton: {
    position: 'absolute',
    right: 2,
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  error: { ...TYPE.caption, color: COLORS.error, marginTop: SPACE.xs },
  formError: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACE.sm,
    backgroundColor: COLORS.errorSoft,
    borderRadius: RADIUS.md,
    padding: SPACE.md,
    marginBottom: SPACE.md,
  },
  button: {
    minHeight: 50,
    borderRadius: RADIUS.md + 2,
    paddingHorizontal: SPACE.xl,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonSecondary: {
    backgroundColor: COLORS.background,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
  },
  buttonDanger: { backgroundColor: COLORS.error },
  buttonText: { color: COLORS.onPrimary, fontWeight: '700', fontSize: 16 },
  link: {
    minHeight: 44,
    paddingHorizontal: SPACE.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkText: { color: COLORS.primary, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: SPACE.md, marginVertical: 6 },
  banner: {
    backgroundColor: COLORS.accentSoft,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.accent,
    padding: SPACE.md,
    borderRadius: RADIUS.md,
    marginBottom: SPACE.md,
  },
  bannerRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
});

/**
 * Filter chip (D78): a pill. Active is gold with black text (D33). `dark` is for the black
 * bar and dark-grey background (raised dark grey with white text when not active).
 */
export function Chip({
  label,
  active,
  onPress,
  icon,
  dark = false,
  onRemove,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon?: IconName;
  dark?: boolean;
  /** Shows an × (e.g. an applied filter you can clear). */
  onRemove?: () => void;
}) {
  const fg = active ? COLORS.onAccent : dark ? COLORS.onSurfaceDark : COLORS.text;
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
      style={({ pressed }) => ({
        minHeight: 36,
        paddingHorizontal: 14,
        borderRadius: RADIUS.pill,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        borderWidth: 1,
        borderColor: active ? COLORS.accent : dark ? COLORS.surfaceDarkRaised : COLORS.border,
        backgroundColor: active
          ? COLORS.accent
          : dark
            ? COLORS.surfaceDarkRaised
            : COLORS.background,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {icon ? <Ionicons name={icon} size={15} color={fg} /> : null}
      <Text style={{ color: fg, fontWeight: '700', fontSize: 14 }}>{label}</Text>
      {onRemove ? <Ionicons name="close" size={15} color={fg} /> : null}
    </Pressable>
  );
}

/**
 * Segmented control (D78): a pill track with the selected option raised. Light: white thumb
 * with teal text. `dark`: gold thumb with black text on the raised dark track.
 */
export function Segmented({
  options,
  value,
  onChange,
  dark = false,
  stretch = false,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
  dark?: boolean;
  /** Fill the width, equal parts. */
  stretch?: boolean;
}) {
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        padding: 3,
        borderRadius: RADIUS.pill,
        backgroundColor: dark ? COLORS.surfaceDarkRaised : COLORS.skeletonOnLight,
        alignSelf: stretch ? 'stretch' : 'flex-start',
      }}
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            onPress={() => {
              if (!active) haptic.select();
              onChange(o.key);
            }}
            style={[
              {
                flex: stretch ? 1 : undefined,
                minHeight: 34,
                paddingHorizontal: 14,
                borderRadius: RADIUS.pill,
                alignItems: 'center',
                justifyContent: 'center',
              },
              active && {
                backgroundColor: dark ? COLORS.accent : COLORS.background,
                ...elevation(1),
              },
            ]}
          >
            <Text
              style={{
                color: active
                  ? dark
                    ? COLORS.onAccent
                    : COLORS.primary
                  : dark
                    ? COLORS.onSurfaceDark
                    : COLORS.textMuted,
                fontWeight: active ? '800' : '600',
                fontSize: 14,
              }}
            >
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Round 44 × 44 icon button (D78). `dark` sits on the black bar (raised dark grey, white
 * icon); `active` turns the icon gold and shows a small gold dot (e.g. filters are on).
 */
export function IconButton({
  icon,
  label,
  onPress,
  busy,
  dark = true,
  active = false,
}: {
  icon: IconName;
  /** Read by screen readers. */
  label: string;
  onPress: () => void;
  busy?: boolean;
  dark?: boolean;
  active?: boolean;
}) {
  const color = dark ? (active ? BRAND.gold : COLORS.onSurfaceDark) : COLORS.text;
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
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: dark ? COLORS.surfaceDarkRaised : COLORS.surfaceMuted,
      }}
    >
      {busy ? (
        <ActivityIndicator color={color} />
      ) : (
        <Ionicons name={icon} size={21} color={color} />
      )}
      {active ? (
        <View
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: BRAND.gold,
          }}
        />
      ) : null}
    </PressableScale>
  );
}

/** D73: refresh button for the black bars on Home and Places. Shows a spinner while busy. */
export function RefreshButton({ onPress, busy }: { onPress: () => void; busy?: boolean }) {
  return <IconButton icon="refresh" label="Refresh" onPress={onPress} busy={busy} />;
}

/**
 * D78: search box for the black bar: a raised dark pill with a magnifier and a clear (×)
 * button once something is typed.
 */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  label,
  maxLength,
  autoCapitalize = 'none',
}: {
  value: string;
  onChangeText: (t: string) => void;
  placeholder: string;
  label: string;
  maxLength?: number;
  autoCapitalize?: TextInputProps['autoCapitalize'];
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View
      style={{
        flex: 1,
        height: 44,
        borderRadius: 22,
        backgroundColor: COLORS.surfaceDarkRaised,
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 14,
        borderWidth: 1.5,
        borderColor: focused ? BRAND.gold : COLORS.surfaceDarkRaised,
      }}
    >
      <Ionicons name="search" size={18} color={COLORS.onSurfaceDarkMuted} />
      <TextInput
        accessibilityLabel={label}
        placeholder={placeholder}
        placeholderTextColor={COLORS.onSurfaceDarkMuted}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCorrect={false}
        autoCapitalize={autoCapitalize}
        returnKeyType="search"
        maxLength={maxLength}
        selectionColor={BRAND.gold}
        style={{ flex: 1, color: COLORS.onSurfaceDark, fontSize: 16, paddingHorizontal: 8 }}
      />
      {value ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Clear search"
          onPress={() => onChangeText('')}
          style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name="close-circle" size={19} color={COLORS.onSurfaceDarkMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}

/**
 * The round floating action button, bottom-right (D70): gold with a black icon (D33).
 * Same size and place everywhere: new post (Home, place discussions) and Add new place.
 */
export function FloatingButton({
  label,
  onPress,
  icon = 'add',
}: {
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
      containerStyle={{ position: 'absolute', right: 20, bottom: 24 }}
      style={{
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: COLORS.accent,
        alignItems: 'center',
        justifyContent: 'center',
        ...elevation(2),
      }}
    >
      <Ionicons name={icon} size={32} color={COLORS.onAccent} />
    </PressableScale>
  );
}

/**
 * D78: friendly empty state: an icon in a soft circle, a short title, an optional line of
 * help, and an optional button. `dark` for the dark-grey feed background.
 */
export function EmptyState({
  icon,
  title,
  body,
  action,
  dark = false,
}: {
  icon: IconName;
  title: string;
  body?: string;
  action?: { label: string; onPress: () => void; icon?: IconName };
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
          width: 76,
          height: 76,
          borderRadius: 38,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: dark ? COLORS.surfaceDarkRaised : COLORS.primarySoft,
        }}
      >
        <Ionicons name={icon} size={34} color={dark ? BRAND.gold : COLORS.primary} />
      </View>
      <Text
        accessibilityRole="header"
        style={[
          TYPE.headline,
          { textAlign: 'center', color: dark ? COLORS.onSurfaceDark : COLORS.text },
        ]}
      >
        {title}
      </Text>
      {body ? (
        <Text
          style={[
            TYPE.callout,
            { textAlign: 'center', color: dark ? COLORS.onSurfaceDarkMuted : COLORS.textMuted },
          ]}
        >
          {body}
        </Text>
      ) : null}
      {action ? (
        <Button
          variant={dark ? 'accent' : 'primary'}
          title={action.label}
          icon={action.icon}
          onPress={action.onPress}
        />
      ) : null}
    </View>
  );
}

/** D78: a load error with a Try again button (location problems, no connection, …). */
export function ErrorState({
  message,
  onRetry,
  dark = false,
}: {
  message: string;
  onRetry?: () => void;
  dark?: boolean;
}) {
  return (
    <View
      accessibilityRole="alert"
      style={{
        margin: SPACE.md,
        padding: SPACE.lg,
        borderRadius: RADIUS.lg,
        backgroundColor: dark ? COLORS.surfaceDarkRaised : COLORS.errorSoft,
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.md,
      }}
    >
      <Ionicons
        name="cloud-offline-outline"
        size={24}
        color={dark ? COLORS.errorOnDark : COLORS.error}
      />
      <Text style={[TYPE.callout, { flex: 1, color: dark ? COLORS.onSurfaceDark : COLORS.text }]}>
        {message}
      </Text>
      {onRetry ? (
        <Button
          variant={dark ? 'linkOnDark' : 'link'}
          title="Try again"
          onPress={onRetry}
          style={{ paddingHorizontal: 0 }}
        />
      ) : null}
    </View>
  );
}

/**
 * D78: loading placeholder that gently pulses, shaped like the content that's coming
 * (instead of a spinner). Holds still when reduce motion is on.
 */
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
  dark = false,
  style,
}: {
  w: number | `${number}%`;
  h: number;
  r?: number;
  dark?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        {
          width: w,
          height: h,
          borderRadius: r,
          backgroundColor: dark ? COLORS.skeletonOnDark : COLORS.skeletonOnLight,
        },
        style,
      ]}
    />
  );
}

/**
 * D78: a short message that slides up near the bottom and fades away ("Added to
 * favorites"). Render `node` last inside the screen's root view; call `show(text)`.
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
        bottom: 100,
        alignSelf: 'center',
        opacity: anim,
        transform: reduced
          ? []
          : [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }],
        backgroundColor: COLORS.surfaceInverse,
        borderRadius: RADIUS.pill,
        paddingHorizontal: 18,
        paddingVertical: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: SPACE.sm,
        ...elevation(3),
      }}
    >
      <Ionicons name={toast.icon} size={18} color={BRAND.gold} />
      <Text style={{ color: COLORS.onSurfaceInverse, fontWeight: '700' }}>{toast.text}</Text>
    </Animated.View>
  ) : null;

  return { node, show };
}

/**
 * D78: a bottom sheet: dimmed background (tap to close), rounded top with a grab handle,
 * an optional title with a close button, and room for the phone's bottom edge.
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
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable
          style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.scrim }]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
        />
        <Animated.View
          style={{
            backgroundColor: COLORS.background,
            borderTopLeftRadius: RADIUS.xl,
            borderTopRightRadius: RADIUS.xl,
            paddingBottom: insets.bottom + SPACE.md,
            maxHeight: '88%',
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
              backgroundColor: COLORS.border,
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
                <Ionicons name="close" size={24} color={COLORS.textMuted} />
              </Pressable>
            </View>
          ) : null}
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

/**
 * D78: a group of settings rows on a white rounded card (the iOS / Material "grouped list"
 * look), with a small caps title above and optional help text below.
 */
export function ListGroup({
  title,
  footer,
  children,
}: {
  title?: string;
  footer?: string;
  children: ReactNode;
}) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={{ marginTop: SPACE.xl }}>
      {title ? (
        <Text
          accessibilityRole="header"
          style={[
            TYPE.overline,
            { color: COLORS.textMuted, marginLeft: SPACE.xs, marginBottom: SPACE.sm },
          ]}
        >
          {title}
        </Text>
      ) : null}
      <View
        style={{
          backgroundColor: COLORS.background,
          borderRadius: RADIUS.lg,
          overflow: 'hidden',
          borderWidth: StyleSheet.hairlineWidth,
          borderColor: COLORS.cardBorder,
        }}
      >
        {rows.map((row, i) => (
          <View key={i}>
            {i > 0 ? (
              <View style={{ height: 1, backgroundColor: COLORS.hairline, marginLeft: 60 }} />
            ) : null}
            {row}
          </View>
        ))}
      </View>
      {footer ? (
        <Text
          style={[
            TYPE.caption,
            { color: COLORS.textMuted, marginHorizontal: SPACE.xs, marginTop: SPACE.sm },
          ]}
        >
          {footer}
        </Text>
      ) : null}
    </View>
  );
}

/** One row in a `ListGroup`: icon tile, label (and detail), value, chevron when it opens something. */
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
  /** Tile color (e.g. a place's category color; icon is white on it). */
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
  const labelColor =
    tone === 'danger' ? COLORS.error : tone === 'primary' ? COLORS.primary : COLORS.text;
  const inner = (
    <>
      {icon ? (
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor:
              iconColor ?? (tone === 'danger' ? COLORS.errorSoft : COLORS.primarySoft),
          }}
        >
          <Ionicons
            name={icon}
            size={18}
            color={iconColor ? COLORS.onPrimary : tone === 'danger' ? COLORS.error : COLORS.primary}
          />
        </View>
      ) : null}
      <View style={{ flex: 1 }}>
        <Text
          style={[TYPE.body, { color: labelColor, fontWeight: tone === 'default' ? '500' : '700' }]}
        >
          {label}
        </Text>
        {detail ? <Text style={[TYPE.caption, { color: COLORS.textMuted }]}>{detail}</Text> : null}
      </View>
      {value ? (
        <Text
          numberOfLines={1}
          style={[TYPE.callout, { color: COLORS.textMuted, maxWidth: '45%' }]}
        >
          {value}
        </Text>
      ) : null}
      {right}
      {action && tone === 'default' ? (
        <Ionicons name="chevron-forward" size={18} color={COLORS.border} />
      ) : null}
    </>
  );
  const row: ViewStyle = {
    minHeight: 54,
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
      android_ripple={{ color: COLORS.skeletonOnLight }}
      style={({ pressed }) => [row, pressed && { backgroundColor: COLORS.surfaceMuted }]}
    >
      {inner}
    </Pressable>
  ) : (
    <View style={row}>{inner}</View>
  );
}

/** D78: a small caps section title on the dark background ("Comments · 4"). */
export function SectionTitle({ children, dark = false }: { children: ReactNode; dark?: boolean }) {
  return (
    <Text
      accessibilityRole="header"
      style={[
        TYPE.overline,
        {
          color: dark ? COLORS.onSurfaceDarkMuted : COLORS.textMuted,
          marginHorizontal: SPACE.lg,
          marginTop: SPACE.lg,
          marginBottom: SPACE.sm,
        },
      ]}
    >
      {children}
    </Text>
  );
}

/**
 * D78: the "•••" menu: the native action sheet on iPhone, a dialog on Android. Keep it to
 * two actions (Android dialogs fit three buttons including Cancel).
 */
export function openMenu(
  title: string,
  items: { label: string; destructive?: boolean; onPress: () => void }[],
) {
  if (Platform.OS === 'ios') {
    const destructive = items.findIndex((i) => i.destructive);
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options: [...items.map((i) => i.label), 'Cancel'],
        cancelButtonIndex: items.length,
        destructiveButtonIndex: destructive >= 0 ? destructive : undefined,
      },
      (index) => items[index]?.onPress(),
    );
    return;
  }
  Alert.alert(
    title,
    undefined,
    [
      ...items.map((i) => ({
        text: i.label,
        style: i.destructive ? ('destructive' as const) : ('default' as const),
        onPress: i.onPress,
      })),
      { text: 'Cancel', style: 'cancel' as const },
    ],
    { cancelable: true },
  );
}
