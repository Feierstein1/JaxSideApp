import { useCallback, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { DARK } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import {
  Button,
  EmptyState,
  ErrorState,
  FormError,
  ListGroup,
  ListRow,
  PageTitle,
  Screen,
} from '@/ui';

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
      <ErrorState message={error} onRetry={() => void load()} />
    ) : (
      <ActivityIndicator style={{ marginTop: 32 }} color={DARK.accent} />
    );
  }
  return (
    <Screen>
      <PageTitle
        title="Blocked users"
        subtitle="Blocked people can’t see your profile, and you won’t see their posts or comments. They aren’t told."
        icon="ban-outline"
      />
      {error ? <FormError>{error}</FormError> : null}
      {blocks.length === 0 ? (
        <EmptyState
          icon="ban-outline"
          title="You haven’t blocked anyone"
          body="To block someone, open their profile and choose Block from the ••• menu."
        />
      ) : (
        <ListGroup first>
          {blocks.map((b) => (
            <ListRow
              key={b.username}
              icon="person-outline"
              label={b.username}
              right={
                <Button
                  variant="secondary"
                  size="sm"
                  title="Unblock"
                  onPress={() => void unblock(b.username)}
                  style={{ marginTop: 0 }}
                />
              }
            />
          ))}
        </ListGroup>
      )}
    </Screen>
  );
}
