import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { COLORS } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { HowStrikesWork } from '@/standing/HowStrikesWork';
import { StrikeList, type Standing } from '@/standing/StrikeList';
import { Button, styles } from '@/ui';

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
      <Text style={[styles.screen, styles.error]}>{error}</Text>
    ) : (
      <ActivityIndicator style={{ marginTop: 32 }} color={COLORS.primary} />
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
      {standing.strikes.length === 0 ? (
        <View style={styles.banner}>
          <Text style={styles.body}>
            Your account is in good standing. Thanks for being a good neighbor.
          </Text>
        </View>
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
    </ScrollView>
  );
}
