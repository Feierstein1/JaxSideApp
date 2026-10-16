import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { COLORS } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { Button, styles } from '@/ui';

interface Strike {
  id: string;
  action: 'WARN' | 'SUSPEND' | 'BAN';
  reason: string;
  createdAt: string;
  until: string | null;
  countsUntil: string;
}

const LABEL: Record<Strike['action'], string> = {
  WARN: 'Warning',
  SUSPEND: 'Suspension',
  BAN: 'Ban',
};
const date = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** P5.6: your warnings and suspensions that still count, and how the steps work. */
export default function AccountStanding() {
  const [strikes, setStrikes] = useState<Strike[]>();
  const [error, setError] = useState<string>();

  useFocusEffect(
    useCallback(() => {
      api
        .get<{ strikes: Strike[] }>('/api/v1/me/standing')
        .then((r) => setStrikes(r.strikes))
        .catch((e: unknown) =>
          setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load.'),
        );
    }, []),
  );

  if (!strikes) {
    return error ? (
      <Text style={[styles.screen, styles.error]}>{error}</Text>
    ) : (
      <ActivityIndicator style={{ marginTop: 32 }} color={COLORS.primary} />
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      {strikes.length === 0 ? (
        <View style={styles.banner}>
          <Text style={styles.body}>
            Your account is in good standing. Thanks for being a good neighbor.
          </Text>
        </View>
      ) : (
        strikes.map((s) => (
          <View
            key={s.id}
            style={{
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: COLORS.cardBorder,
            }}
          >
            <Text style={[styles.label, { marginBottom: 2 }]}>
              {LABEL[s.action]} · {date(s.createdAt)}
            </Text>
            <Text style={styles.body}>{s.reason}</Text>
            <Text style={styles.muted}>
              {s.until ? `Suspended until ${date(s.until)}. ` : ''}Counts until{' '}
              {date(s.countsUntil)}.
            </Text>
          </View>
        ))
      )}
      <Text style={[styles.label, { marginTop: 16 }]}>How it works</Text>
      <Text style={styles.body}>
        Breaking the Community Guidelines leads to a warning, then a 1-day suspension, then a 7-day
        suspension, then a permanent ban. Each step stops counting after 6 months. Serious cases may
        skip steps. A person reviews every step.
      </Text>
      <Button
        variant="link"
        title="Read the Community Guidelines"
        onPress={() => router.push('/account/legal/guidelines')}
      />
    </ScrollView>
  );
}
