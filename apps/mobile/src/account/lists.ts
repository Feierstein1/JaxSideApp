import { api } from '@/api';
import { cached, invalidate, MINUTE } from '@/cache';

/**
 * D259: your favorite places and the people you've blocked. Both change only when you change
 * them, so they are kept a few minutes (see `@/cache`); saving a place, blocking or unblocking
 * clears them.
 */
export interface Favorite {
  id: string;
  name: string;
  category: string;
}

export interface Block {
  username: string;
  blockedAt: string;
}

export const fetchFavorites = (force = false) =>
  cached(
    'me:favorites',
    5 * MINUTE,
    async () => (await api.get<{ favorites: Favorite[] }>('/api/v1/me/favorites')).favorites,
    force,
  );

export const fetchBlocks = (force = false) =>
  cached(
    'me:blocks',
    5 * MINUTE,
    async () => (await api.get<{ blocks: Block[] }>('/api/v1/me/blocks')).blocks,
    force,
  );

export const favoritesChanged = () => invalidate('me:favorites');
export const blocksChanged = () => invalidate('me:blocks');
