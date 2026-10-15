import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';

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
        placeholderTextColor="#888"
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
          placeholderTextColor="#888"
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
  variant?: 'primary' | 'link';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ busy: !!busy, disabled: !!busy }}
      disabled={busy}
      onPress={onPress}
      style={variant === 'primary' ? styles.button : styles.link}
    >
      {busy ? (
        <ActivityIndicator color="white" />
      ) : (
        <Text style={variant === 'primary' ? styles.buttonText : styles.linkText}>{title}</Text>
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

export const styles = StyleSheet.create({
  screen: { padding: 24, gap: 4 },
  title: { fontSize: 26, fontWeight: '700', marginBottom: 8 },
  body: { fontSize: 15, color: '#333', lineHeight: 21 },
  muted: { color: '#666' },
  field: { marginBottom: 12 },
  label: { fontWeight: '600', marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: '#bbb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  inputError: { borderColor: '#b00020' },
  passwordRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passwordInput: { flex: 1 },
  showButton: { paddingHorizontal: 8, paddingVertical: 10 },
  error: { color: '#b00020', marginTop: 4 },
  formError: { marginBottom: 8 },
  button: {
    backgroundColor: '#1d4ed8',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  buttonText: { color: 'white', fontWeight: '600', fontSize: 16 },
  link: { paddingVertical: 10, alignItems: 'center' },
  linkText: { color: '#1d4ed8', fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 6 },
  banner: { backgroundColor: '#fef3c7', padding: 12, borderRadius: 8, marginBottom: 12 },
});
