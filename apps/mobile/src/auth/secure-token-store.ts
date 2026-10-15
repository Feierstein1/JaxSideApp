import * as SecureStore from 'expo-secure-store';
import type { TokenStore } from '@/api/client';

const KEY = 'jax.session';

/**
 * Session token in the OS keychain/keystore. The token is only a credential;
 * identity, role and status always come from the server (§3).
 */
export const secureTokenStore: TokenStore = {
  get: () => SecureStore.getItemAsync(KEY),
  set: (token) => SecureStore.setItemAsync(KEY, token),
  clear: () => SecureStore.deleteItemAsync(KEY),
};
