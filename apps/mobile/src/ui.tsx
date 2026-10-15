import type { ReactNode } from 'react';
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
