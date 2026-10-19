import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { router } from 'expo-router';
import { DARK } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { restrictedCredentials } from '@/standing/restricted-credentials';
import { HowStrikesWork } from '@/standing/HowStrikesWork';
import { StrikeList, shortDate, type Standing } from '@/standing/StrikeList';
import { Button, ErrorState, PageTitle, Screen } from '@/ui';

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
      <Screen>
        <PageTitle
          title="Account standing"
          subtitle="Sign in first, then choose “See why and appeal”."
          icon="shield-outline"
        />
        <Button title="Back to sign in" onPress={() => router.back()} />
      </Screen>
    );
  }
  if (!standing) {
    return error ? (
      <ErrorState message={error} />
    ) : (
      <ActivityIndicator style={{ marginTop: 32 }} color={DARK.accent} />
    );
  }
  const ban = standing.status === 'BANNED';
  const suspension = [...standing.strikes].reverse().find((s) => s.until);
  return (
    <Screen keyboard>
      <PageTitle
        title={ban ? 'Your account is banned' : 'Your account is suspended'}
        subtitle={
          !ban && suspension?.until
            ? `You can sign in again after ${shortDate(suspension.until)}.`
            : undefined
        }
        icon={ban ? 'ban-outline' : 'pause-circle-outline'}
      />
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
    </Screen>
  );
}
