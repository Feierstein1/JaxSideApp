import { useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { BRAND, COLORS } from '@jax/shared';
import { UserBadge } from './auth/UserBadge';

export function Field({
  label,
  error,
  ...input
}: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        style={[styles.input, error ? styles.inputError : null]}
        placeholderTextColor={COLORS.placeholder}
        {...input}
      />
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

/**
 * Password input with a Show/Hide toggle. Capitalization, autocorrect and spellcheck
 * are off: on Android the keyboard can otherwise silently capitalize the first
 * character of a hidden field, so the saved password differs from what the user meant.
 */
export function PasswordField({
  label,
  error,
  ...input
}: Omit<TextInputProps, 'secureTextEntry'> & { label: string; error?: string }) {
  const [visible, setVisible] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.passwordRow}>
        <TextInput
          accessibilityLabel={label}
          style={[styles.input, styles.passwordInput, error ? styles.inputError : null]}
          placeholderTextColor={COLORS.placeholder}
          secureTextEntry={!visible}
          autoCapitalize="none"
          autoCorrect={false}
          spellCheck={false}
          {...input}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={visible ? `Hide ${label}` : `Show ${label}`}
          onPress={() => setVisible((v) => !v)}
          style={styles.showButton}
        >
          <Text style={styles.linkText}>{visible ? 'Hide' : 'Show'}</Text>
        </Pressable>
      </View>
      {error ? (
        <Text style={styles.error} accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

export function Button({
  title,
  onPress,
  busy,
  variant = 'primary',
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'danger' | 'link';
}) {
  const box =
    variant === 'link'
      ? styles.link
      : variant === 'secondary'
        ? [styles.button, styles.buttonSecondary]
        : variant === 'danger'
          ? [styles.button, styles.buttonDanger]
          : styles.button;
  const label =
    variant === 'link'
      ? styles.linkText
      : variant === 'secondary'
        ? [styles.buttonText, { color: COLORS.primary }]
        : styles.buttonText;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: !!busy, disabled: !!busy }}
      disabled={busy}
      onPress={onPress}
      style={box}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'secondary' ? COLORS.primary : COLORS.onPrimary} />
      ) : (
        <Text style={label}>{title}</Text>
      )}
    </Pressable>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <Text style={[styles.error, styles.formError]} accessibilityRole="alert">
      {children}
    </Text>
  );
}

/**
 * Navigation header (D33): black bar, white title, gold back arrow (9.2:1 on black), and
 * the signed-in username on the right (hideable, D43).
 */
export const headerOptions = {
  headerRight: () => <UserBadge />,
  headerTitleAlign: 'center' as const,
  headerStyle: { backgroundColor: COLORS.surfaceInverse },
  headerTintColor: BRAND.gold,
  headerTitleStyle: { color: COLORS.onSurfaceInverse },
  contentStyle: { backgroundColor: COLORS.background },
};

/** Switch colors: teal when on. */
export const switchColors = {
  trackColor: { false: COLORS.border, true: COLORS.primary },
  thumbColor: COLORS.background,
};

export const styles = StyleSheet.create({
  screen: { padding: 24, gap: 4 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 8 },
  body: { fontSize: 15, color: COLORS.text, lineHeight: 21 },
  muted: { color: COLORS.textMuted },
  field: { marginBottom: 12 },
  label: { fontWeight: '600', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  inputError: { borderColor: COLORS.error },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passwordInput: { flex: 1 },
  showButton: { paddingHorizontal: 8, paddingVertical: 10 },
  error: { color: COLORS.error, marginTop: 4 },
  formError: { marginBottom: 8 },
  button: {
    backgroundColor: COLORS.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonSecondary: {
    backgroundColor: COLORS.background,
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  buttonDanger: { backgroundColor: COLORS.error },
  buttonText: { color: COLORS.onPrimary, fontWeight: '600', fontSize: 16 },
  link: { paddingVertical: 10, alignItems: 'center' },
  linkText: { color: COLORS.primary, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 6 },
  banner: {
    backgroundColor: COLORS.accentSoft,
    borderLeftWidth: 4,
    borderLeftColor: COLORS.accent,
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
});

/** Category filter chip: gold with black text when active (D33). */
export function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        marginRight: 8,
        marginBottom: 8,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: active ? COLORS.accent : COLORS.border,
        backgroundColor: active ? COLORS.accent : COLORS.background,
      }}
    >
      <Text style={{ color: active ? COLORS.onAccent : COLORS.text, fontWeight: '600' }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Small segmented control: teal with white text when selected. */
export function Segmented({
  options,
  value,
  onChange,
}: {
  options: { key: string; label: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <View
      style={{
        flexDirection: 'row',
        borderWidth: 1,
        borderColor: COLORS.primary,
        borderRadius: 8,
        overflow: 'hidden',
      }}
    >
      {options.map((o) => {
        const active = o.key === value;
        return (
          <Pressable
            key={o.key}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            onPress={() => onChange(o.key)}
            style={{
              paddingHorizontal: 10,
              paddingVertical: 6,
              backgroundColor: active ? COLORS.primary : COLORS.background,
            }}
          >
            <Text
              style={{
                color: active ? COLORS.onPrimary : COLORS.primary,
                fontWeight: '600',
                fontSize: 13,
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
  icon?: ComponentProps<typeof Ionicons>['name'];
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={{
        position: 'absolute',
        right: 20,
        bottom: 24,
        width: 58,
        height: 58,
        borderRadius: 29,
        backgroundColor: COLORS.accent,
        alignItems: 'center',
        justifyContent: 'center',
        shadowColor: COLORS.shadow,
        shadowOpacity: 0.35,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 6,
      }}
    >
      <Ionicons name={icon} size={32} color={COLORS.onAccent} />
    </Pressable>
  );
}
