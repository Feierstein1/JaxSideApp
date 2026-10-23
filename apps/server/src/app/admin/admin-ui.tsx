'use client';

import type { CSSProperties, ReactNode } from 'react';
import { BRAND, COLORS } from '@jax/shared';

/**
 * Shared look for the admin portal (D33 colors: black bar, teal actions, gold
 * accents on dark only) and the fetch helper that adds the CSRF header (D3).
 */

export const ui = {
  page: {
    fontFamily: 'system-ui, sans-serif',
    color: COLORS.text,
    background: COLORS.surfaceMuted,
    minHeight: '100vh',
    margin: 0,
  },
  main: { maxWidth: 1100, margin: '0 auto', padding: 24 },
  card: {
    background: COLORS.background,
    border: `1px solid ${COLORS.cardBorder}`,
    borderRadius: 10,
    padding: 20,
  },
  input: {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 12px',
    fontSize: 16,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    margin: '6px 0 14px',
  },
  button: {
    background: COLORS.primary,
    color: COLORS.onPrimary,
    border: 0,
    borderRadius: 8,
    padding: '10px 18px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
  },
  buttonSecondary: {
    background: COLORS.background,
    color: COLORS.primary,
    border: `2px solid ${COLORS.primary}`,
    borderRadius: 8,
    padding: '8px 16px',
    fontSize: 14,
    fontWeight: 600,
    cursor: 'pointer',
  },
  buttonDanger: {
    background: COLORS.error,
    color: COLORS.onPrimary,
    border: 0,
    borderRadius: 8,
    padding: '10px 18px',
    fontSize: 15,
    fontWeight: 600,
    cursor: 'pointer',
  },
  error: { color: COLORS.error },
  muted: { color: COLORS.textMuted },
  label: { fontWeight: 600 },
} satisfies Record<string, CSSProperties>;

export function TopBar({ username, children }: { username?: string; children?: ReactNode }) {
  return (
    <header
      style={{
        background: COLORS.surfaceInverse,
        color: COLORS.onSurfaceInverse,
        borderBottom: `4px solid ${BRAND.gold}`,
      }}
    >
      <div
        style={{
          ...ui.main,
          display: 'flex',
          alignItems: 'center',
          gap: 24,
          paddingTop: 14,
          paddingBottom: 14,
        }}
      >
        <strong style={{ color: BRAND.gold, fontSize: 18 }}>JaxSide Admin</strong>
        <nav style={{ display: 'flex', gap: 18, flex: 1 }}>{children}</nav>
        {username ? <span>@{username}</span> : null}
      </div>
    </header>
  );
}

export function NavLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      style={{ color: COLORS.onSurfaceInverse, textDecoration: 'none', fontWeight: 600 }}
    >
      {children}
    </a>
  );
}

function csrfToken(): string {
  const m = document.cookie.match(/(?:^|;\s*)jax_admin_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : '';
}

/** JSON request to the admin API with the CSRF header. Throws Error(message) on failure. */
export async function adminFetch<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken(),
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: 'same-origin',
  });
  const json = await res.json().catch(() => ({}));
  if (res.status === 401) window.location.href = '/admin/login';
  if (!res.ok) throw new Error(json.error?.message ?? `Request failed (${res.status})`);
  return json as T;
}

export function SignOutButton() {
  return (
    <button
      style={{
        ...ui.buttonSecondary,
        background: 'transparent',
        color: COLORS.onSurfaceInverse,
        borderColor: COLORS.onSurfaceInverse,
      }}
      onClick={async () => {
        await adminFetch('/api/v1/admin/logout', { method: 'POST' }).catch(() => undefined);
        window.location.href = '/admin/login';
      }}
    >
      Sign out
    </button>
  );
}
