import { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { api } from '@/api';
import { useAuth } from '@/auth/AuthContext';
import { serverErrors } from '@/forms';
import { Button, FormError, styles } from '@/ui';

/** Signed-in placeholder. The general feed replaces this in Phase 3. */
export default function Home() {
  const { state, signOut, refresh } = useAuth();
  const [note, setNote] = useState<string>();
  const [error, setError] = useState<string>();
  if (state.status !== 'signedIn') return null;
  const { user } = state;

  async function resend() {
    setError(undefined);
    try {
      const r = await api.post<{ status: string }>('/api/v1/auth/verify-email/resend', {});
      setNote(r.status === 'already_verified' ? 'Already confirmed.' : 'Sent. Check your email.');
      if (r.status === 'already_verified') await refresh();
    } catch (e) {
      setError(serverErrors(e).form);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.screen}>
      <Text style={styles.title}>Hi, {user.username}</Text>
      {!user.emailVerified && (
        <Text style={[styles.body, styles.banner]}>
          Confirm your email to start posting. You can read without it.
        </Text>
      )}
      {!user.emailVerified && (
        <Button variant="link" title="Resend confirmation email" onPress={resend} />
      )}
      {!user.emailVerified && <Button variant="link" title="I've confirmed it" onPress={refresh} />}
      {note ? <Text style={styles.muted}>{note}</Text> : null}
      <FormError>{error}</FormError>
      <Text style={[styles.body, styles.muted]}>The local feed arrives in Phase 3.</Text>
      <Button title="Sign out" onPress={signOut} />
    </ScrollView>
  );
}
