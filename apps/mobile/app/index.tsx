import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { API_BASE_URL, api } from '@/api';
import { ApiRequestError } from '@/api/client';

type Health = { status: string; database: string };

/** Placeholder home: confirms the app can reach the server. Replaced by the feed in Phase 3. */
export default function Home() {
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'ok'; health: Health } | { kind: 'error'; message: string }
  >({ kind: 'loading' });

  async function check() {
    setState({ kind: 'loading' });
    try {
      setState({ kind: 'ok', health: await api.get<Health>('/api/v1/health') });
    } catch (e) {
      setState({
        kind: 'error',
        message: e instanceof ApiRequestError ? e.message : 'Unknown error',
      });
    }
  }

  useEffect(() => {
    void check();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Jax</Text>
      <Text style={styles.muted}>Server: {API_BASE_URL}</Text>
      {state.kind === 'loading' && <ActivityIndicator />}
      {state.kind === 'ok' && (
        <Text accessibilityRole="text">
          Server {state.health.status}, database {state.health.database}
        </Text>
      )}
      {state.kind === 'error' && <Text style={styles.error}>{state.message}</Text>}
      <Pressable accessibilityRole="button" onPress={check} style={styles.button}>
        <Text style={styles.buttonText}>Check again</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  title: { fontSize: 28, fontWeight: '700' },
  muted: { color: '#666' },
  error: { color: '#b00020', textAlign: 'center' },
  button: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: '#1d4ed8',
  },
  buttonText: { color: 'white', fontWeight: '600' },
});
