import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { type MySubmission, DARK } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { categoryLabel, timeAgo } from '@/format';
import { CategoryTile } from '@/places/PlaceHeader';
import { SPACE, TYPE } from '@/tokens';
import { Button, Card, EmptyState, ErrorState, PageTitle, Screen, StatusBadge } from '@/ui';
import { Text } from '@/text';

const STATUS: Record<MySubmission['status'], string> = {
  PENDING: 'Waiting for votes nearby', // D94
  APPROVED: 'Approved: it’s in Places',
  REJECTED: 'Not approved',
  DUPLICATE: 'Already listed',
  MERGED: 'Already listed',
  EXPIRED: 'Not enough votes in 60 days', // D94
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
      <Screen>
        <ErrorState message={error} />
      </Screen>
    ) : (
      <Screen>
        <ActivityIndicator style={{ marginTop: 32 }} color={DARK.accent} />
      </Screen>
    );
  }
  return (
    <Screen>
      <PageTitle
        title="My suggestions"
        subtitle="Places you suggested and how the review went."
        icon="add-circle-outline"
      />
      {items.length === 0 ? (
        <EmptyState
          icon="storefront-outline"
          title="No suggestions yet"
          body="Missing a spot? Go to Places and tap the + button to suggest it."
          action={{
            label: 'Suggest a place',
            icon: 'add',
            onPress: () => router.push('/places/suggest'),
          }}
        />
      ) : (
        <View style={{ gap: SPACE.sm }}>
          {items.map((s) => (
            <Card key={s.id} style={{ flexDirection: 'row', gap: SPACE.md, alignItems: 'center' }}>
              <CategoryTile category={s.category} size={44} />
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={TYPE.headline} numberOfLines={1}>
                  {s.name}
                </Text>
                <Text style={[TYPE.caption, { color: DARK.textMuted }]}>
                  {categoryLabel(s.category)} · {timeAgo(s.createdAt)}
                </Text>
                <View style={{ flexDirection: 'row', marginTop: 4 }}>
                  <StatusBadge
                    text={STATUS[s.status]}
                    tone={
                      s.status === 'APPROVED' ? 'good' : s.status === 'PENDING' ? 'wait' : 'neutral'
                    }
                  />
                </View>
                {s.decisionReason ? (
                  <Text style={[TYPE.caption, { color: DARK.textMuted }]}>{s.decisionReason}</Text>
                ) : null}
              </View>
              {s.placeId ? (
                <Button
                  variant="link"
                  title="Open"
                  onPress={() => router.push(`/places/${s.placeId}`)}
                />
              ) : null}
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
