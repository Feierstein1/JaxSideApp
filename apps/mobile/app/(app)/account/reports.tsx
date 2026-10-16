import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { COLORS, REPORT_REASON_LABELS, type MyReport } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { timeAgo } from '@/format';
import { styles } from '@/ui';

const STATUS: Record<MyReport['status'], string> = {
  OPEN: 'Waiting for review',
  ACTIONED: 'Action taken',
  DISMISSED: 'Reviewed, no action',
};
const KIND: Record<MyReport['targetType'], string> = {
  general: 'Post',
  business: 'Business post',
  comment: 'Comment',
  user: 'Profile',
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
      <Text style={[styles.screen, styles.error]}>{error}</Text>
    ) : (
      <ActivityIndicator style={{ marginTop: 32 }} color={COLORS.primary} />
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      {reports.length === 0 ? (
        <Text style={styles.muted}>
          You haven’t reported anything. To report a post, comment or profile, open it and tap
          Report.
        </Text>
      ) : (
        reports.map((r) => (
          <View
            key={r.id}
            style={{
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: COLORS.cardBorder,
            }}
          >
            <Text style={styles.muted}>
              {KIND[r.targetType]} · {REPORT_REASON_LABELS[r.reason]} · {timeAgo(r.createdAt)}
            </Text>
            <Text style={styles.body} numberOfLines={2}>
              {r.preview}
            </Text>
            <Text
              style={{
                marginTop: 2,
                fontWeight: '700',
                color: r.status === 'OPEN' ? COLORS.textMuted : COLORS.primary,
              }}
            >
              {STATUS[r.status]}
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}
