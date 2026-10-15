import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { api, ensureInstallation, onUnauthorized } from '@/api';
import type { GuestStatus, LoginResponse, MeUser, SessionResponse } from '@/api/types';
import { secureTokenStore } from './secure-token-store';

type AuthState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'signedIn'; user: MeUser }
  | { status: 'guest'; guest: GuestStatus };

interface AuthApi {
  state: AuthState;
  signIn(identifier: string, password: string): Promise<void>;
  /** P4.1: browse as a guest on this installation (one guest per install). */
  continueAsGuest(): Promise<void>;
  signOut(): Promise<void>;
  refresh(): Promise<void>;
}

const AuthContext = createContext<AuthApi | null>(null);

/**
 * Who is signed in (a user or a guest), as reported by the server (/session). The stored token is only a
 * credential; the app never decides identity or permissions on its own (§3).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });

  const refresh = useCallback(async () => {
    // Register this install first (once). If the server is unreachable, carry on;
    // the next launch retries.
    await ensureInstallation().catch(() => undefined);
    if (!(await secureTokenStore.get())) {
      setState({ status: 'signedOut' });
      return;
    }
    try {
      const res = await api.get<SessionResponse>('/api/v1/session');
      setState(
        res.kind === 'user'
          ? { status: 'signedIn', user: res.user }
          : { status: 'guest', guest: res.guest },
      );
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

  const continueAsGuest = useCallback(async () => {
    await ensureInstallation();
    const res = await api.post<{ token: string; guest: GuestStatus }>('/api/v1/guests', {});
    await secureTokenStore.set(res.token);
    setState({ status: 'guest', guest: res.guest });
  }, []);

  const signOut = useCallback(async () => {
    try {
      // Guests have no server logout; resuming guest mode later rotates the token.
      if (state.status === 'signedIn') await api.post('/api/v1/auth/logout');
    } catch {
      // Still clear locally; the server session expires on its own.
    }
    await secureTokenStore.clear();
    setState({ status: 'signedOut' });
  }, [state.status]);

  const value = useMemo(
    () => ({ state, signIn, continueAsGuest, signOut, refresh }),
    [state, signIn, continueAsGuest, signOut, refresh],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthApi {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
