import { useState } from 'react';
import { View } from 'react-native';
import { DARK, EMAIL_CODE_LENGTH, verifyEmailCodeSchema } from '@jax/shared';
import { api } from '@/api';
import { serverErrors, validate, type FieldErrors } from '@/forms';
import { Button, Field, FormError, styles } from '@/ui';
import { useAuth } from './AuthContext';
import { Text } from '@/text';

/** D31: confirm your email with the 6-digit code (shown until confirmed). */
export function EmailCodeCard({ email }: { email: string }) {
  const { refresh } = useAuth();
  const [code, setCode] = useState('');
  const [note, setNote] = useState<string>();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);

  async function confirm() {
    const v = validate(verifyEmailCodeSchema, { code });
    if (!v.ok) return setErrors(v.errors);
    setErrors({});
    setBusy(true);
    try {
      await api.post('/api/v1/auth/verify-email/code', v.data);
      setCode('');
      await refresh();
    } catch (e) {
      setErrors(serverErrors(e));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setErrors({});
    try {
      const r = await api.post<{ status: string }>('/api/v1/auth/verify-email/resend', {});
      if (r.status === 'already_verified') await refresh();
      else setNote('New code sent. Check your email.');
    } catch (e) {
      setErrors(serverErrors(e));
    }
  }

  return (
    <View
      style={{
        marginTop: 12,
        padding: 16,
        borderRadius: 16,
        backgroundColor: DARK.card,
        borderWidth: 1,
        borderColor: DARK.accent,
      }}
    >
      <Text style={[styles.body, { marginBottom: 8 }]}>
        Confirm your email to post, comment and vote. Enter the 6-digit code we sent to {email}.
      </Text>
      <FormError>{errors.form}</FormError>
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
      />
      <Button title="Confirm email" onPress={() => void confirm()} busy={busy} />
      <Button variant="link" title="Send a new code" onPress={() => void resend()} />
      <Button variant="link" title="I used the link in the email" onPress={() => void refresh()} />
      {note ? <Text style={styles.muted}>{note}</Text> : null}
    </View>
  );
}
