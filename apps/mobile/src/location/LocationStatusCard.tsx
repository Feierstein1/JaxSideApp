import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { COLORS } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { Button, styles } from '@/ui';
import { getFreshReading } from './device';

type Status =
  | { kind: 'checking' }
  | { kind: 'ok' }
  | { kind: 'denied'; message: string }
  | { kind: 'error'; message: string };

/**
 * Shows whether the server accepts the user's current location (P2.9). The decision is
 * the server's; this card only displays it.
 */
export function LocationStatusCard() {
  const [status, setStatus] = useState<Status>({ kind: 'checking' });

  const check = useCallback(async () => {
    setStatus({ kind: 'checking' });
    try {
      const reading = await getFreshReading();
      await api.post('/api/v1/location/status', { reading });
      setStatus({ kind: 'ok' });
    } catch (e) {
      if (e instanceof ApiRequestError && e.status === 403) {
        setStatus({ kind: 'denied', message: e.message });
      } else if (e instanceof ApiRequestError) {
        setStatus({ kind: 'error', message: e.message });
      } else {
        setStatus({ kind: 'error', message: 'Couldn’t get your location. Is GPS turned on?' });
      }
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return (
    <View style={[styles.banner, { marginTop: 12 }]}>
      {status.kind === 'checking' && (
        <View style={styles.row}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.body}>Checking your location…</Text>
        </View>
      )}
      {status.kind === 'ok' && (
        <Text style={styles.body} accessibilityLiveRegion="polite">
          📍 You&apos;re in Duval County. Location features are ready.
        </Text>
      )}
      {(status.kind === 'denied' || status.kind === 'error') && (
        <>
          <Text style={[styles.body, status.kind === 'error' && { color: COLORS.error }]}>
            {status.message}
          </Text>
          <Button variant="link" title="Check again" onPress={check} />
        </>
      )}
    </View>
  );
}
