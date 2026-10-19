import { useState } from 'react';
import { router } from 'expo-router';
import { CONFIG_DEFAULTS, usernameChangeSchema } from '@jax/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { serverErrors, validate, type FieldErrors } from '@/forms';
import { Button, Field, FormError, PageTitle, Screen, styles } from '@/ui';
import { Text } from '@/text';

/** P4.9: change your username. Your account ID never changes; there's a cooldown. */
export default function ChangeUsername() {
  const { state, refresh } = useAuth();
  const current = state.status === 'signedIn' ? state.user.username : '';
  const [username, setUsername] = useState(current);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  async function submit() {
    const v = validate(usernameChangeSchema, { username: username.trim() });
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    try {
      await api.patch('/api/v1/me/username', v.data);
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
      <PageTitle title="Username" subtitle="This is the name people see on your posts." icon="at" />
      <Text style={[styles.body, { marginBottom: 12 }]}>
        You can change your username once every {CONFIG_DEFAULTS['username.changeCooldownDays']}{' '}
        days. Changing only capital letters is always allowed. Your old name stays reserved for a
        while so no one can pretend to be you.
      </Text>
      <FormError>{errors.form}</FormError>
      <Field
        label="New username"
        icon="at"
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={20}
        error={errors.username}
        onSubmitEditing={submit}
      />
      <Button title="Save username" onPress={submit} busy={busy} />
    </Screen>
  );
}
