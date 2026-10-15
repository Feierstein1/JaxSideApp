import { createApiClient } from './client';
import { installationStore, secureTokenStore } from '@/auth/secure-token-store';

/**
 * Server URL. EXPO_PUBLIC_* values are bundled into the app, so this must never hold a secret.
 * On a physical device use your computer's LAN IP, e.g. http://192.168.1.10:3000.
 */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000';

const unauthorizedListeners = new Set<() => void>();

/** Lets the auth state react when the server rejects the session (expired, revoked, deleted). */
export function onUnauthorized(listener: () => void): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

export const api = createApiClient({
  baseUrl: API_BASE_URL,
  tokenStore: secureTokenStore,
  onUnauthorized: () => unauthorizedListeners.forEach((fn) => fn()),
  getInstallationToken: () => installationStore.get(),
});

/**
 * P2.7: registers this app install with the server once and keeps the token in the
 * keychain/keystore. Not a hardware ID; reinstalling the app creates a new one.
 */
export async function ensureInstallation(): Promise<void> {
  if (await installationStore.get()) return;
  const { installationToken } = await api.post<{ installationToken: string }>(
    '/api/v1/installations',
    {},
  );
  await installationStore.set(installationToken);
}
