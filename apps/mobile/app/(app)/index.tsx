import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { EMAIL_CODE_LENGTH, verifyEmailCodeSchema } from '@jax/shared';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { serverErrors, validate, type FieldErrors } from '@/forms';
import { LocationStatusCard } from '@/location/LocationStatusCard';
import { Button, Field, FormError, styles } from '@/ui';

/** Signed-in placeholder. The general feed replaces this in Phase 3. */
export default function Home() {
  const { state, signOut, refresh } = useAuth();
  const [code, setCode] = useState('');
  const [note, setNote] = useState<string>();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  if (state.status !== 'signedIn') return null;
  const { user } = state;

  async function confirmCode() {
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
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Hi, {user.username}</Text>
      <LocationStatusCard />
      {!user.emailVerified && (
        <View style={styles.banner}>
          <Text style={[styles.body, { marginBottom: 8 }]}>
            Confirm your email to start posting. Enter the 6-digit code we sent to {user.email}.
          </Text>
          <FormError>{errors.form}</FormError>
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
          <Button title="Confirm email" onPress={confirmCode} busy={busy} />
          <Button variant="link" title="Send a new code" onPress={resend} />
          <Button variant="link" title="I used the link in the email" onPress={refresh} />
          {note ? <Text style={styles.muted}>{note}</Text> : null}
        </View>
      )}
      {user.emailVerified && <Text style={styles.body}>Your email is confirmed.</Text>}
      <Text style={[styles.body, styles.muted]}>The local feed arrives in Phase 3.</Text>
      <Button title="Sign out" onPress={signOut} />
    </ScrollView>
  );
}
