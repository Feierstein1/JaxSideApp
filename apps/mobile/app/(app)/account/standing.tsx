import { useCallback, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { DARK } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { HowStrikesWork } from '@/standing/HowStrikesWork';
import { StrikeList, type Standing } from '@/standing/StrikeList';
import { Banner, Button, ErrorState, PageTitle, Screen } from '@/ui';

/** P5.6 / P5.7: your warnings and suspensions that still count, with appeals. */
export default function AccountStanding() {
  const [standing, setStanding] = useState<Standing>();
  const [error, setError] = useState<string>();

  const load = useCallback(() => {
    api
      .get<Standing>('/api/v1/me/standing')
      .then(setStanding)
      .catch((e: unknown) => setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load.'));
  }, []);
  useFocusEffect(load);

  if (!standing) {
    return error ? (
      <ErrorState message={error} />
    ) : (
      <ActivityIndicator style={{ marginTop: 32 }} color={DARK.accent} />
    );
  }
  return (
    <Screen keyboard>
      <PageTitle
        title="Account standing"
        subtitle="Warnings and suspensions that still count, and your appeals."
        icon="shield-checkmark-outline"
      />
      {standing.strikes.length === 0 ? (
        <Banner icon="shield-checkmark" tone="success">
          Your account is in good standing. Thanks for being a good neighbor.
        </Banner>
      ) : (
        <StrikeList
          strikes={standing.strikes}
          onAppeal={async (actionId, message) => {
            await api.post('/api/v1/me/appeals', { actionId, message });
            load();
          }}
        />
      )}
      <HowStrikesWork />
      <Button
        variant="link"
        title="Read the Community Guidelines"
        onPress={() => router.push('/account/legal/guidelines')}
      />
    </Screen>
  );
}
