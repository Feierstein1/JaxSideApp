import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text } from 'react-native';
import { router } from 'expo-router';
import { COLORS } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { restrictedCredentials } from '@/standing/restricted-credentials';
import { HowStrikesWork } from '@/standing/HowStrikesWork';
import { StrikeList, shortDate, type Standing } from '@/standing/StrikeList';
import { Button, styles } from '@/ui';

/**
 * P5.7 (D59): a banned or suspended person can't sign in, so this screen uses the
 * username and password they just typed (held in memory only) to show why and let
 * them appeal. Nothing else is possible from here.
 */
export default function AppealScreen() {
  const [standing, setStanding] = useState<Standing>();
  const [error, setError] = useState<string>();
  const creds = restrictedCredentials.get();

  const load = useCallback(async () => {
    if (!creds) return;
    try {
      setStanding(await api.post<Standing>('/api/v1/appeals/restricted/standing', creds));
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load.');
    }
  }, [creds]);

  useEffect(() => {
    void load();
    return () => restrictedCredentials.clear();
  }, [load]);

  if (!creds) {
    return (
      <ScrollView contentContainerStyle={styles.screen}>
        <Text style={styles.body}>Sign in first, then choose “See why and appeal”.</Text>
        <Button title="Back to sign in" onPress={() => router.back()} />
      </ScrollView>
    );
  }
  if (!standing) {
    return error ? (
      <Text style={[styles.screen, styles.error]}>{error}</Text>
    ) : (
      <ActivityIndicator style={{ marginTop: 32 }} color={COLORS.primary} />
    );
  }
  const ban = standing.status === 'BANNED';
  const suspension = [...standing.strikes].reverse().find((s) => s.until);
  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>
        {ban ? 'Your account is banned' : 'Your account is suspended'}
      </Text>
      {!ban && suspension?.until ? (
        <Text style={[styles.body, { marginBottom: 8 }]}>
          You can sign in again after {shortDate(suspension.until)}.
        </Text>
      ) : null}
      <StrikeList
        strikes={standing.strikes}
        onAppeal={async (actionId, message) => {
          await api.post('/api/v1/appeals/restricted', { ...creds, actionId, message });
          await load();
        }}
      />
      <HowStrikesWork />
      <Button
        variant="link"
        title="Read the Community Guidelines"
        onPress={() => router.push('/legal/guidelines')}
      />
    </ScrollView>
  );
}
