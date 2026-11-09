import { useCallback, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { categoryColor, DARK } from '@jax/shared';
import { api } from '@/api';
import { ApiRequestError } from '@/api/client';
import { categoryLabel } from '@/format';
import { categoryIcon } from '@/places/PlaceHeader';
import { EmptyState, ErrorState, ListGroup, ListRow, PageTitle, Screen } from '@/ui';

interface Favorite {
  id: string;
  name: string;
  category: string;
}

/** D223: every place you have saved, newest first, in one scrolling list. */
export default function AllFavorites() {
  const [favorites, setFavorites] = useState<Favorite[]>();
  const [error, setError] = useState<string>();

  const load = useCallback(async () => {
    setError(undefined);
    try {
      setFavorites((await api.get<{ favorites: Favorite[] }>('/api/v1/me/favorites')).favorites);
    } catch (e) {
      setError(e instanceof ApiRequestError ? e.message : 'Couldn’t load favorites.');
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  if (!favorites) {
    return error ? (
      <ErrorState message={error} onRetry={() => void load()} />
    ) : (
      <ActivityIndicator style={{ marginTop: 32 }} color={DARK.accent} />
    );
  }
  return (
    <Screen>
      <PageTitle
        title="Favorite places"
        subtitle={`${favorites.length} saved, newest first`}
        icon="star"
      />
      {favorites.length === 0 ? (
        <EmptyState
          icon="star-outline"
          title="No favorites yet"
          body="Tap “Save to favorites” on a place to keep it here."
        />
      ) : (
        <ListGroup>
          {favorites.map((f) => (
            <ListRow
              key={f.id}
              icon={categoryIcon(f.category)}
              iconColor={categoryColor(f.category)}
              label={f.name}
              detail={categoryLabel(f.category)}
              href={`/places/${f.id}`}
            />
          ))}
        </ListGroup>
      )}
    </Screen>
  );
}
