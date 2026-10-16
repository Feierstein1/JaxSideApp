import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { COLORS, type MySubmission } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { categoryLabel, timeAgo } from '@/format';
import { Button, styles } from '@/ui';

const STATUS: Record<MySubmission['status'], string> = {
  PENDING: 'Waiting for review',
  APPROVED: 'Approved: it’s in Places',
  REJECTED: 'Not approved',
  DUPLICATE: 'Already listed',
  MERGED: 'Already listed',
};

/** P5.8: places you suggested and how they went. */
export default function MySuggestions() {
  const [items, setItems] = useState<MySubmission[]>();
  const [error, setError] = useState<string>();

  useFocusEffect(
    useCallback(() => {
      api
        .get<{ submissions: MySubmission[] }>('/api/v1/me/submissions')
        .then((r) => setItems(r.submissions))
        .catch((e: unknown) =>
          setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load.'),
        );
    }, []),
  );

  if (!items) {
    return error ? (
      <Text style={[styles.screen, styles.error]}>{error}</Text>
    ) : (
      <ActivityIndicator style={{ marginTop: 32 }} color={COLORS.primary} />
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      {items.length === 0 ? (
        <Text style={styles.muted}>
          You haven’t suggested any places. Missing a spot? Go to Places and tap “Suggest a place”.
        </Text>
      ) : (
        items.map((s) => (
          <View
            key={s.id}
            style={{
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: COLORS.cardBorder,
            }}
          >
            <Text style={styles.label}>{s.name}</Text>
            <Text style={styles.muted}>
              {categoryLabel(s.category)} · {timeAgo(s.createdAt)}
            </Text>
            <Text
              style={{
                marginTop: 2,
                fontWeight: '700',
                color: s.status === 'APPROVED' ? COLORS.primary : COLORS.textMuted,
              }}
            >
              {STATUS[s.status]}
              {s.decisionReason ? `: ${s.decisionReason}` : ''}
            </Text>
            {s.placeId ? (
              <Button
                variant="link"
                title="Open place"
                onPress={() => router.push(`/places/${s.placeId}`)}
              />
            ) : null}
          </View>
        ))
      )}
    </ScrollView>
  );
}
