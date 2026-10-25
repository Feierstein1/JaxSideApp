import { useCallback, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { REPORT_REASON_LABELS, type MyReport, DARK } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { timeAgo } from '@/format';
import { SPACE, TYPE } from '@/tokens';
import { Card, EmptyState, ErrorState, PageTitle, Screen, StatusBadge } from '@/ui';
import { Text } from '@/text';

const STATUS: Record<MyReport['status'], string> = {
  OPEN: 'Waiting for review',
  ACTIONED: 'Action taken',
  DISMISSED: 'Reviewed, no action',
};
const KIND: Record<MyReport['targetType'], string> = {
  general: 'Post',
  business: 'Business post',
  comment: 'Comment',
  photo: 'Photo',
  user: 'Profile',
  topic: 'Topic', // D133
};

/** P4.11 / P5.1: the reports you've sent and where they stand. */
export default function MyReports() {
  const [reports, setReports] = useState<MyReport[]>();
  const [error, setError] = useState<string>();

  useFocusEffect(
    useCallback(() => {
      api
        .get<{ reports: MyReport[] }>('/api/v1/me/reports')
        .then((r) => setReports(r.reports))
        .catch((e: unknown) =>
          setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load.'),
        );
    }, []),
  );

  if (!reports) {
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
        title="My reports"
        subtitle="What you’ve reported and where it stands. The people you report are never told who reported them."
        icon="flag-outline"
      />
      {reports.length === 0 ? (
        <EmptyState
          icon="flag-outline"
          title="No reports"
          body="To report a post, comment or profile, open it and choose Report from the ••• menu."
        />
      ) : (
        <View style={{ gap: SPACE.sm }}>
          {reports.map((r) => (
            <Card key={r.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={[TYPE.overline, { color: DARK.textMuted, flex: 1 }]}>
                  {KIND[r.targetType]} · {timeAgo(r.createdAt)}
                </Text>
                <StatusBadge
                  text={STATUS[r.status]}
                  tone={r.status === 'OPEN' ? 'wait' : r.status === 'ACTIONED' ? 'good' : 'neutral'}
                />
              </View>
              <Text style={TYPE.body} numberOfLines={2}>
                {r.preview}
              </Text>
              <Text style={[TYPE.caption, { color: DARK.textMuted }]}>
                Reason: {REPORT_REASON_LABELS[r.reason]}
              </Text>
            </Card>
          ))}
        </View>
      )}
    </Screen>
  );
}
