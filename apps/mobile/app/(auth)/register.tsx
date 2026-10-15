import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Switch, Text, View } from 'react-native';
import { router } from 'expo-router';
import { PASSWORD_MIN, registerRequestSchema } from '@jax/shared';
import { api } from '@/api';
import { serverErrors, validate, type FieldErrors } from '@/forms';
import { Button, Field, FormError, PasswordField, styles } from '@/ui';

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [birthYear, setBirthYear] = useState('');
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [confirmAdult, setConfirmAdult] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    const v = validate(registerRequestSchema, {
      username,
      email,
      password,
      birthYear: birthYear.trim() === '' ? undefined : Number(birthYear),
      acceptTerms,
      confirmAdult,
    });
    // Confirmation is a client-side typo check only; it is never sent to the server.
    const mismatch = password !== confirmPassword ? "Passwords don't match" : undefined;
    if (!v.ok || mismatch) {
      return setErrors({
        ...(v.ok ? {} : v.errors),
        ...(mismatch ? { confirmPassword: mismatch } : {}),
      });
    }
    setErrors({});
    setBusy(true);
    try {
      await api.post('/api/v1/auth/register', v.data);
      router.replace({ pathname: '/sign-in', params: { registered: '1' } });
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
        <Text style={[styles.body, styles.banner]}>
          Jax is for adults 18 and older. We ask for your birth year only to check that, and it is
          never shown on your profile. It is a simple age check, not identity verification.
        </Text>
        <FormError>{errors.form}</FormError>
        <Field
          label="Username"
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="Letters, numbers, underscores"
          error={errors.username}
        />
        <Field
          label="Email (private)"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          error={errors.email}
        />
        <PasswordField
          label="Password"
          value={password}
          onChangeText={setPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          placeholder={`At least ${PASSWORD_MIN} characters`}
          error={errors.password}
        />
        <PasswordField
          label="Confirm password"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          autoComplete="new-password"
          textContentType="newPassword"
          error={errors.confirmPassword}
        />
        <Field
          label="Birth year"
          value={birthYear}
          onChangeText={setBirthYear}
          keyboardType="number-pad"
          maxLength={4}
          placeholder="e.g. 1990"
          error={errors.birthYear}
        />
        <View style={styles.row}>
          <Switch
            value={confirmAdult}
            onValueChange={setConfirmAdult}
            accessibilityLabel="I am 18 or older"
          />
          <Text style={styles.body}>I am 18 or older</Text>
        </View>
        <FormError>{errors.confirmAdult}</FormError>
        <View style={styles.row}>
          <Switch
            value={acceptTerms}
            onValueChange={setAcceptTerms}
            accessibilityLabel="I accept the Terms of Service"
          />
          <Text style={styles.body}>I accept the Terms of Service</Text>
        </View>
        <FormError>{errors.acceptTerms}</FormError>
        <Button title="Create account" onPress={submit} busy={busy} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
