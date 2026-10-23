import { useState } from 'react';

import { router } from 'expo-router';
import { accountDeleteSchema, CONFIG_DEFAULTS } from '@jax/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { serverErrors, validate, type FieldErrors } from '@/forms';
import { Button, Field, FormError, PageTitle, PasswordField, Screen, styles } from '@/ui';
import { Text } from '@/text';
import { showAlert } from '@/dialog';

/** P4.12: delete your account (password, plus typing DELETE). */
export default function DeleteAccount() {
  const { signOut } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const days = CONFIG_DEFAULTS['retention.deletedAccountDays'];

  async function submit() {
    const v = validate(accountDeleteSchema, { password, confirm: confirm.trim() });
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    try {
      await api.post('/api/v1/me/delete', v.data);
      showAlert(
        'Account deleted',
        'Your account has been deleted. Thanks for being part of JaxSide.',
        undefined,
        { icon: 'checkmark-circle', tone: 'success' },
      );
      await signOut(); // the server already signed out every device
    } catch (e) {
      setErrors(serverErrors(e));
      setBusy(false);
    }
  }

  return (
    <Screen keyboard>
      <PageTitle title="Delete account" icon="trash-outline" />
      <Text style={[styles.body, { marginBottom: 8 }]}>
        Deleting your account signs you out everywhere and hides your profile right away. Your posts
        stay but show “deleted user.” Your email is kept encrypted for {days} days in case of abuse
        reports, then destroyed. This can’t be undone.
      </Text>
      <Button
        variant="link"
        title="Read the Data Retention policy"
        onPress={() => router.push('/account/legal/retention')}
      />
      <FormError>{errors.form}</FormError>
      <PasswordField
        label="Your password"
        value={password}
        onChangeText={setPassword}
        autoComplete="current-password"
        textContentType="password"
        error={errors.password}
      />
      <Field
        label="Type DELETE to confirm"
        icon="warning-outline"
        value={confirm}
        onChangeText={setConfirm}
        autoCapitalize="characters"
        autoCorrect={false}
        error={errors.confirm}
      />
      <Button variant="danger" title="Delete my account" onPress={submit} busy={busy} />
    </Screen>
  );
}
