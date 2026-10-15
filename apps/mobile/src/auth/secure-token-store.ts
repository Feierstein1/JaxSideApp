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

/** P2.7 installation token. Kept across sign-outs (it identifies the install, not the user). */
export const installationStore: TokenStore = {
  get: () => SecureStore.getItemAsync('jax.installation'),
  set: (token) => SecureStore.setItemAsync('jax.installation', token),
  clear: () => SecureStore.deleteItemAsync('jax.installation'),
};
