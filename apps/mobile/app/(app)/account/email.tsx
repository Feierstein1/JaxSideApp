import { useState } from 'react';
import { router } from 'expo-router';
import { EMAIL_CODE_LENGTH, emailChangeConfirmSchema, emailChangeSchema } from '@jax/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { serverErrors, validate, type FieldErrors } from '@/forms';
import { Banner, Button, Field, FormError, PageTitle, PasswordField, Screen } from '@/ui';

/**
 * P4.10: change email. A 6-digit code goes to the new address; the switch happens only
 * after you enter it. Your old address gets a notice either way.
 */
export default function ChangeEmail() {
  const { refresh } = useAuth();
  const [step, setStep] = useState<'request' | 'confirm'>('request');
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  async function request() {
    const v = validate(emailChangeSchema, { newEmail: newEmail.trim(), password });
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    try {
      await api.post('/api/v1/me/email', v.data);
      setPassword('');
      setStep('confirm');
    } catch (e) {
      setErrors(serverErrors(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    const v = validate(emailChangeConfirmSchema, { code });
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    try {
      await api.post('/api/v1/me/email/confirm', v.data);
      await refresh();
      router.back();
    } catch (e) {
      setErrors(serverErrors(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen keyboard>
      <PageTitle
        title="Change email"
        subtitle="We send a code to the new address. Your old address gets a notice."
        icon="mail-outline"
      />
      <FormError>{errors.form}</FormError>
      {step === 'request' ? (
        <>
          <Field
            label="New email"
            icon="mail-outline"
            value={newEmail}
            onChangeText={setNewEmail}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
            error={errors.newEmail}
          />
          <PasswordField
            label="Your password"
            value={password}
            onChangeText={setPassword}
            autoComplete="current-password"
            textContentType="password"
            error={errors.password}
            onSubmitEditing={request}
          />
          <Button title="Send code" onPress={request} busy={busy} />
        </>
      ) : (
        <>
          <Banner icon="mail-open-outline" tone="info">
            If {newEmail.trim()} can be used, we sent it a 6-digit code. Enter it to finish.
          </Banner>
          <Field
            label="6-digit code"
            icon="keypad-outline"
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            maxLength={EMAIL_CODE_LENGTH + 1}
            placeholder="123 456"
            error={errors.code}
            onSubmitEditing={confirm}
          />
          <Button title="Confirm new email" onPress={confirm} busy={busy} />
          <Button variant="link" title="Use a different email" onPress={() => setStep('request')} />
        </>
      )}
    </Screen>
  );
}
