import { createApiClient } from './client';
import { documentDirectory, getInfoAsync, writeAsStringAsync } from 'expo-file-system/legacy';
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

const maintenanceListeners = new Set<(message: string) => void>();

/** D246: the server says it is switched off for maintenance. */
export function onMaintenance(listener: (message: string) => void): () => void {
  maintenanceListeners.add(listener);
  return () => maintenanceListeners.delete(listener);
}

export const api = createApiClient({
  baseUrl: API_BASE_URL,
  tokenStore: secureTokenStore,
  onUnauthorized: () => unauthorizedListeners.forEach((fn) => fn()),
  onMaintenance: (message) => maintenanceListeners.forEach((fn) => fn(message)),
  getInstallationToken: () => installationStore.get(),
});

/**
 * D277: a file in the app's own folder, which the phone deletes with the app. The iPhone
 * Keychain is NOT deleted with the app, so without this a reinstall would keep the old
 * installation ID (and session): the Privacy Policy promises a new ID, and Apple's agreement
 * (3.3.3(B)) bars permanent device identifiers.
 */
const INSTALL_MARKER = `${documentDirectory}jax-installed`;

async function isFreshInstall(): Promise<boolean> {
  if (!documentDirectory) return false;
  return !(await getInfoAsync(INSTALL_MARKER)).exists;
}

/**
 * P2.7: registers this app install with the server once and keeps the token in the
 * keychain/keystore. Not a hardware ID; reinstalling the app creates a new one (D277).
 */
export async function ensureInstallation(): Promise<void> {
  if (await isFreshInstall()) {
    // Leftovers from an earlier install of the app on this phone: start clean.
    await installationStore.clear();
    await secureTokenStore.clear();
    await writeAsStringAsync(INSTALL_MARKER, '1');
  }
  if (await installationStore.get()) return;
  const { installationToken } = await api.post<{ installationToken: string }>(
    '/api/v1/installations',
    {},
  );
  await installationStore.set(installationToken);
}
