import { beforeEach, describe, expect, it, vi } from 'vitest';

// D277: a reinstall starts clean even though the iPhone Keychain outlives the app.
const files = new Set<string>();
const keychain = new Map<string, string>();

vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///app/',
  getInfoAsync: async (uri: string) => ({ exists: files.has(uri) }),
  writeAsStringAsync: async (uri: string) => void files.add(uri),
}));
vi.mock('@/auth/secure-token-store', () => {
  const store = (key: string) => ({
    get: async () => keychain.get(key) ?? null,
    set: async (v: string) => void keychain.set(key, v),
    clear: async () => void keychain.delete(key),
  });
  return { secureTokenStore: store('session'), installationStore: store('installation') };
});

const { api, ensureInstallation } = await import('./index');

beforeEach(() => {
  files.clear();
  keychain.clear();
  vi.restoreAllMocks();
  vi.spyOn(api, 'post').mockResolvedValue({ installationToken: 'new-install' });
});

describe('ensureInstallation (D277)', () => {
  it('a fresh install drops a leftover installation ID and session from the Keychain', async () => {
    keychain.set('installation', 'old-install');
    keychain.set('session', 'old-session');
    await ensureInstallation();
    expect(keychain.get('installation')).toBe('new-install');
    expect(keychain.has('session')).toBe(false);
    expect(files.has('file:///app/jax-installed')).toBe(true);
  });

  it('later launches keep the same installation and session', async () => {
    files.add('file:///app/jax-installed');
    keychain.set('installation', 'kept-install');
    keychain.set('session', 'kept-session');
    await ensureInstallation();
    expect(keychain.get('installation')).toBe('kept-install');
    expect(keychain.get('session')).toBe('kept-session');
    expect(api.post).not.toHaveBeenCalled();
  });
});
