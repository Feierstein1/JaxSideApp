import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { loginRequestSchema } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { useAuth } from '@/auth/AuthContext';
import { restrictedCredentials } from '@/standing/restricted-credentials';
import { serverErrors, validate, type FieldErrors } from '@/forms';
import { Button, Field, FormError, PasswordField, styles } from '@/ui';

export default function SignIn() {
  const { signIn, continueAsGuest } = useAuth();
  const params = useLocalSearchParams<{ registered?: string; reset?: string }>();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [guestBusy, setGuestBusy] = useState(false);
  /** P5.7: banned or suspended; offer the appeal screen. */
  const [restricted, setRestricted] = useState(false);

  async function guest() {
    setErrors({});
    setGuestBusy(true);
    try {
      await continueAsGuest();
    } catch (e) {
      setErrors(serverErrors(e));
    } finally {
      setGuestBusy(false);
    }
  }

  async function submit() {
    const v = validate(loginRequestSchema, { identifier, password });
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setRestricted(false);
    setBusy(true);
    try {
      await signIn(v.data.identifier, v.data.password);
    } catch (e) {
      setErrors(serverErrors(e));
      if (
        e instanceof ApiRequestError &&
        (e.code === 'ACCOUNT_BANNED' || e.code === 'ACCOUNT_SUSPENDED')
      ) {
        restrictedCredentials.set(v.data.identifier, v.data.password);
        setRestricted(true);
      }
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
        {restricted ? (
          <Button
            variant="secondary"
            title="See why and appeal"
            onPress={() => router.push('/appeal')}
          />
        ) : null}
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
        <View style={{ marginTop: 24 }}>
          <Button variant="secondary" title="Continue as guest" onPress={guest} busy={guestBusy} />
          <Text style={[styles.muted, { marginTop: 6, textAlign: 'center' }]}>
            Browse posts in your area right away. Posting, commenting, voting and business
            discussions need a free account.
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
