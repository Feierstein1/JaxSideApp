import { useState } from 'react';
import { PASSWORD_MIN, passwordChangeSchema } from '@jax/shared';
import { api } from '@/api';
import { serverErrors, validate, type FieldErrors } from '@/forms';
import { Banner, Button, FormError, PageTitle, PasswordField, Screen } from '@/ui';

/** P4.10: change password. Every other device is signed out; this one stays signed in. */
export default function ChangePassword() {
  const [currentPassword, setCurrent] = useState('');
  const [newPassword, setNew] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit() {
    const v = validate(passwordChangeSchema, { currentPassword, newPassword });
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    try {
      await api.post('/api/v1/me/password', v.data);
      setCurrent('');
      setNew('');
      setDone(true);
    } catch (e) {
      setErrors(serverErrors(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen keyboard>
      <PageTitle
        title="Change password"
        subtitle="Every other phone signed in to your account will be signed out."
        icon="key-outline"
      />
      {done ? (
        <Banner icon="checkmark-circle" tone="success">
          Password changed. Any other phones signed in to your account were signed out.
        </Banner>
      ) : null}
      <FormError>{errors.form}</FormError>
      <PasswordField
        label="Current password"
        value={currentPassword}
        onChangeText={setCurrent}
        autoComplete="current-password"
        textContentType="password"
        error={errors.currentPassword}
      />
      <PasswordField
        label={`New password (at least ${PASSWORD_MIN} characters)`}
        value={newPassword}
        onChangeText={setNew}
        autoComplete="new-password"
        textContentType="newPassword"
        error={errors.newPassword}
        onSubmitEditing={submit}
      />
      <Button title="Change password" onPress={submit} busy={busy} />
    </Screen>
  );
}
