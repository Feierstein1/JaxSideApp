import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { COLORS, type NotificationView } from '@jax/shared';
import { ApiRequestError } from '@/api/client';
import { timeAgo } from '@/format';
import { social } from '@/social/api';
import { FriendRow } from '@/social/FriendRow';
import { clearUnread } from '@/social/unread';
import { Button, styles } from '@/ui';

/** D76: the bell's list. Opening it marks everything read; requests can be answered here. */
export default function Notifications() {
  const [items, setItems] = useState<NotificationView[]>();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState<string>();

  const load = useCallback(async () => {
    try {
      setItems((await social.notifications()).notifications);
      await social.markRead();
      clearUnread();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load notifications.');
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function answer(id: string, accept: boolean) {
    setBusy(id);
    try {
      await (accept ? social.accept(id) : social.decline(id));
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t answer.');
    } finally {
      setBusy(undefined);
    }
  }

  if (!items) {
    return error ? (
      <Text style={[styles.screen, styles.error]}>{error}</Text>
    ) : (
      <ActivityIndicator style={{ marginTop: 32 }} color={COLORS.primary} />
    );
  }
  return (
    <FlatList
      contentContainerStyle={styles.screen}
      data={items}
      keyExtractor={(n) => n.id}
      ListHeaderComponent={error ? <Text style={styles.error}>{error}</Text> : null}
      ListEmptyComponent={
        <Text style={styles.muted}>Nothing new. Friend requests show up here.</Text>
      }
      renderItem={({ item: n }) =>
        n.actor ? (
          <FriendRow
            user={n.actor}
            subtitle={`${n.type === 'FRIEND_REQUEST' ? 'wants to be friends' : 'accepted your friend request'} · ${timeAgo(n.createdAt)}`}
          >
            {n.pendingRequestId ? (
              <View style={{ flexDirection: 'row', gap: 6 }}>
                <Button
                  title="Accept"
                  busy={busy === n.pendingRequestId}
                  onPress={() => void answer(n.pendingRequestId!, true)}
                />
                <Button
                  variant="link"
                  title="Decline"
                  onPress={() => void answer(n.pendingRequestId!, false)}
                />
              </View>
            ) : null}
          </FriendRow>
        ) : null
      }
    />
  );
}
