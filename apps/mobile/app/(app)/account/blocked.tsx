import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { COLORS } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { Button, styles } from '@/ui';

interface Block {
  username: string;
  blockedAt: string;
}

/** P4.11: people you've blocked, with Unblock. */
export default function BlockedUsers() {
  const [blocks, setBlocks] = useState<Block[]>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    try {
      setBlocks((await api.get<{ blocks: Block[] }>('/api/v1/me/blocks')).blocks);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load.');
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function unblock(username: string) {
    try {
      await api.delete(`/api/v1/users/${encodeURIComponent(username)}/block`);
      await load();
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t unblock.');
    }
  }

  if (!blocks) {
    return error ? (
      <Text style={[styles.screen, styles.error]}>{error}</Text>
    ) : (
      <ActivityIndicator style={{ marginTop: 32 }} color={COLORS.primary} />
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.screen}>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {blocks.length === 0 ? (
        <Text style={styles.muted}>
          You haven’t blocked anyone. To block someone, tap their name and choose Block.
        </Text>
      ) : (
        blocks.map((b) => (
          <View
            key={b.username}
            style={[
              styles.row,
              {
                justifyContent: 'space-between',
                borderBottomWidth: 1,
                borderBottomColor: COLORS.cardBorder,
              },
            ]}
          >
            <Text style={styles.body}>{b.username}</Text>
            <Button variant="link" title="Unblock" onPress={() => void unblock(b.username)} />
          </View>
        ))
      )}
    </ScrollView>
  );
}
