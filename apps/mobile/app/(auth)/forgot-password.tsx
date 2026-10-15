import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text } from 'react-native';
import { router } from 'expo-router';
import {
  EMAIL_CODE_LENGTH,
  PASSWORD_MIN,
  passwordResetCodeSchema,
  passwordResetRequestSchema,
} from '@jax/shared';
import { api } from '@/api';
import { serverErrors, validate, type FieldErrors } from '@/forms';
import { Button, Field, FormError, PasswordField, styles } from '@/ui';

/**
 * In-app password reset (D31): 1) enter email, 2) enter the emailed code plus a new password.
 * The server answers step 1 the same way whether or not the account exists.
 */
export default function ForgotPassword() {
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  async function requestCode() {
    const v = validate(passwordResetRequestSchema, { email });
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    try {
      await api.post('/api/v1/auth/password-reset/request', v.data);
      setStep('code');
    } catch (e) {
      setErrors(serverErrors(e));
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    const v = validate(passwordResetCodeSchema, { email, code, newPassword });
    const mismatch = newPassword !== confirm ? "Passwords don't match" : undefined;
    if (!v.ok || mismatch) {
      return setErrors({ ...(v.ok ? {} : v.errors), ...(mismatch ? { confirm: mismatch } : {}) });
    }
    setErrors({});
    setBusy(true);
    try {
      await api.post('/api/v1/auth/password-reset/confirm-code', v.data);
      router.replace({ pathname: '/sign-in', params: { reset: '1' } });
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
        <FormError>{errors.form}</FormError>
        {step === 'email' ? (
          <>
            <Text style={styles.body}>
              Enter your account email. If it matches an account, we'll email you a 6-digit code.
            </Text>
            <Field
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              autoComplete="email"
              error={errors.email}
            />
            <Button title="Send code" onPress={requestCode} busy={busy} />
          </>
        ) : (
          <>
            <Text style={[styles.body, styles.banner]}>
              If {email.trim()} has an account, a code is on its way. It expires in 15 minutes.
            </Text>
            <Field
              label="6-digit code"
              value={code}
              onChangeText={setCode}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              maxLength={EMAIL_CODE_LENGTH + 1}
              placeholder="123 456"
              error={errors.code}
            />
            <PasswordField
              label="New password"
              value={newPassword}
              onChangeText={setNewPassword}
              autoComplete="new-password"
              textContentType="newPassword"
              placeholder={`At least ${PASSWORD_MIN} characters`}
              error={errors.newPassword}
            />
            <PasswordField
              label="Confirm new password"
              value={confirm}
              onChangeText={setConfirm}
              autoComplete="new-password"
              textContentType="newPassword"
              error={errors.confirm}
            />
            <Button title="Reset password" onPress={resetPassword} busy={busy} />
            <Button variant="link" title="Send a new code" onPress={requestCode} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
