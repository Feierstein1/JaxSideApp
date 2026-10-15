import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, onUnauthorized } from '@/api';
import type { LoginResponse, MeUser } from '@/api/types';
import { secureTokenStore } from './secure-token-store';

type AuthState =
  { status: 'loading' } | { status: 'signedOut' } | { status: 'signedIn'; user: MeUser };

interface AuthApi {
  state: AuthState;
  signIn(identifier: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  refresh(): Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

/**
 * Who is signed in, as reported by the server (/me). The stored token is only a
 * credential; the app never decides identity or permissions on its own (§3).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    if (!(await secureTokenStore.get())) {
      setState({ status: 'signedOut' });
      return;
    }
    try {
      const { user } = await api.get<{ user: MeUser }>('/api/v1/me');
      setState({ status: 'signedIn', user });
    } catch {
      // 401 already cleared the token. Other failures (offline, banned) end the session view.
      setState({ status: 'signedOut' });
    }
  }, []);

  useEffect(() => {
    void refresh();
    return onUnauthorized(() => setState({ status: 'signedOut' }));
  }, [refresh]);

  const signIn = useCallback(async (identifier: string, password: string) => {
    const res = await api.post<LoginResponse>('/api/v1/auth/login', { identifier, password });
    await secureTokenStore.set(res.token);
    setState({ status: 'signedIn', user: res.user });
  }, []);

  const signOut = useCallback(async () => {
    try {
      await api.post('/api/v1/auth/logout');
    } catch {
      // Still clear locally; the server session expires on its own.
    }
    await secureTokenStore.clear();
    setState({ status: 'signedOut' });
  }, []);

  const value = useMemo(
    () => ({ state, signIn, signOut, refresh }),
    [state, signIn, signOut, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
