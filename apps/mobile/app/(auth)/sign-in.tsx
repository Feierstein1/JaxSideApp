import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { loginRequestSchema } from '@jax/shared';
import { useAuth } from '@/auth/AuthContext';
import { serverErrors, validate, type FieldErrors } from '@/forms';
import { Button, Field, FormError, PasswordField, styles } from '@/ui';

export default function SignIn() {
  const { signIn } = useAuth();
  const params = useLocalSearchParams<{ registered?: string; reset?: string }>();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    const v = validate(loginRequestSchema, { identifier, password });
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    try {
      await signIn(v.data.identifier, v.data.password);
    } catch (e) {
      setErrors(serverErrors(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={{ flex: 1 }}
    >
      <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Welcome to Jax</Text>
        {params.registered ? (
          <Text style={[styles.body, styles.banner]}>
            Account created. Sign in, then enter the 6-digit code we emailed you.
          </Text>
        ) : null}
        {params.reset ? (
          <Text style={[styles.body, styles.banner]}>
            Password changed. Sign in with your new password.
          </Text>
        ) : null}
        <FormError>{errors.form}</FormError>
        <Field
          label="Username or email"
          value={identifier}
          onChangeText={setIdentifier}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="username"
          textContentType="username"
          error={errors.identifier}
        />
        <PasswordField
          label="Password"
          value={password}
          onChangeText={setPassword}
          autoComplete="current-password"
          textContentType="password"
          error={errors.password}
          onSubmitEditing={submit}
        />
        <Button title="Sign in" onPress={submit} busy={busy} />
        <Button
          variant="link"
          title="Forgot password?"
          onPress={() => router.push('/forgot-password')}
        />
        <Button variant="link" title="Create an account" onPress={() => router.push('/register')} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
