'use client';

import type { CSSProperties } from 'react';
import { usePathname } from 'next/navigation';
import { BRAND, COLORS } from '@jax/shared';

/**
 * Shared look for the admin portal (D33 colors: dark sidebar, teal actions, gold accents on
 * dark only) and the fetch helper that adds the CSRF header (D3).
 */

const SHADOW = '0 1px 2px rgba(0,0,0,0.04), 0 2px 6px rgba(0,0,0,0.05)';

export const ui = {
  page: {
    color: COLORS.text,
    background: COLORS.surfaceMuted,
    minHeight: '100vh',
    margin: 0,
  },
  main: { maxWidth: 1240, margin: '0 auto', padding: '28px 36px 48px' },
  card: {
    background: COLORS.background,
    border: `1px solid ${COLORS.cardBorder}`,
    borderRadius: 12,
    padding: 20,
    boxShadow: SHADOW,
  },
  input: {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    padding: '9px 12px',
    fontSize: 14,
    fontFamily: 'inherit',
    color: COLORS.text,
    background: COLORS.background,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    margin: '6px 0 14px',
  },
  button: {
    background: COLORS.primary,
    color: COLORS.onPrimary,
    border: `1px solid ${COLORS.primary}`,
    borderRadius: 8,
    padding: '9px 16px',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    boxShadow: SHADOW,
  },
  buttonSecondary: {
    background: COLORS.background,
    color: COLORS.primary,
    border: `1px solid ${COLORS.cardBorder}`,
    borderRadius: 8,
    padding: '8px 14px',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    boxShadow: SHADOW,
  },
  buttonDanger: {
    background: COLORS.error,
    color: COLORS.onPrimary,
    border: `1px solid ${COLORS.error}`,
    borderRadius: 8,
    padding: '9px 16px',
    fontSize: 14,
    fontWeight: 600,
    fontFamily: 'inherit',
    cursor: 'pointer',
    boxShadow: SHADOW,
  },
  error: { color: COLORS.error },
  muted: { color: COLORS.textMuted },
  label: { fontWeight: 600, fontSize: 13 },
} satisfies Record<string, CSSProperties>;

/**
 * Base styles for every admin page: type scale, links, focus rings and hover states that
 * inline styles can't express. Colors come from the shared tokens.
 */
export function AdminStyles() {
  const css = `
    body { margin: 0; background: ${COLORS.surfaceMuted}; }
    .adm {
      font-family: "Segoe UI", system-ui, -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif;
      font-size: 14px; line-height: 1.5; color: ${COLORS.text};
      -webkit-font-smoothing: antialiased;
    }
    .adm h1 { font-size: 24px; font-weight: 700; letter-spacing: -0.01em; margin: 0 0 20px; }
    .adm h2 { font-size: 17px; font-weight: 650; margin: 28px 0 12px; }
    .adm h3 { font-size: 15px; font-weight: 650; margin: 20px 0 8px; }
    .adm p { margin: 8px 0; }
    .adm main a { color: ${COLORS.primary}; text-decoration: none; font-weight: 500; }
    .adm main a:hover { text-decoration: underline; }
    .adm button { transition: filter 120ms, box-shadow 120ms, background 120ms; }
    .adm button:hover:not(:disabled) { filter: brightness(1.08); }
    .adm button:disabled { opacity: 0.55; cursor: not-allowed; }
    .adm input:focus, .adm select:focus, .adm textarea:focus {
      outline: 2px solid ${COLORS.primary}; outline-offset: 0; border-color: ${COLORS.primary};
    }
    .adm button:focus-visible, .adm a:focus-visible {
      outline: 2px solid ${COLORS.primary}; outline-offset: 2px;
    }
    .adm input[type="checkbox"], .adm input[type="radio"] { accent-color: ${COLORS.primary}; }
    .adm table tbody tr:hover td { background: ${COLORS.primarySoft}; }
    .adm table tbody tr:last-child td { border-bottom: 0; }
    .adm-pill::first-letter { text-transform: uppercase; }
    .adm-nav a { transition: background 120ms, color 120ms; }
    .adm-nav a:hover { background: ${COLORS.surfaceDarkRaised}; color: ${COLORS.onSurfaceDark}; }
  `;
  return <style dangerouslySetInnerHTML={{ __html: css }} />;
}

function Brand() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span
        aria-hidden
        style={{
          width: 30,
          height: 30,
          borderRadius: 8,
          background: BRAND.gold,
          color: COLORS.onAccent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 800,
          fontSize: 16,
        }}
      >
        J
      </span>
      <span style={{ lineHeight: 1.15 }}>
        <strong style={{ color: COLORS.onSurfaceDark, fontSize: 15, display: 'block' }}>
          JaxSide
        </strong>
        <span style={{ color: BRAND.gold, fontSize: 12, fontWeight: 600 }}>Admin portal</span>
      </span>
    </div>
  );
}

/** The plain dark bar on the sign-in page. */
export function TopBar() {
  return (
    <header style={{ background: COLORS.surfaceInverse, borderBottom: `3px solid ${BRAND.gold}` }}>
      <div style={{ ...ui.main, paddingTop: 14, paddingBottom: 14 }}>
        <Brand />
      </div>
    </header>
  );
}

export type NavGroup = { title: string; links: { href: string; label: string }[] };

/** The portal's left-hand menu, grouped, with the current page highlighted. */
export function Sidebar({ username, groups }: { username: string; groups: NavGroup[] }) {
  const raw = usePathname() ?? '';
  // A case page belongs to the Reports queue.
  const path = raw.startsWith('/admin/cases/') ? '/admin/reports' : raw;
  const isActive = (href: string) =>
    href === '/admin' ? path === '/admin' : path === href || path.startsWith(`${href}/`);
  // "Places" (/admin/places) shouldn't light up for "Place suggestions" and vice versa.
  const best = groups
    .flatMap((g) => g.links)
    .filter((l) => isActive(l.href))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <aside
      className="adm-nav"
      style={{
        width: 236,
        flexShrink: 0,
        background: COLORS.surfaceDark,
        color: COLORS.onSurfaceDarkMuted,
        position: 'sticky',
        top: 0,
        height: '100vh',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        borderRight: `3px solid ${BRAND.gold}`,
        boxSizing: 'border-box',
      }}
    >
      <div style={{ padding: '20px 18px 12px' }}>
        <Brand />
      </div>
      <nav style={{ flex: 1, padding: '4px 10px 16px' }}>
        {groups.map((g) => (
          <div key={g.title} style={{ marginTop: 16 }}>
            <div
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                padding: '0 10px 6px',
                color: COLORS.onSurfaceDark,
              }}
            >
              {g.title}
            </div>
            {g.links.map((l) => {
              const on = l.href === best;
              return (
                <a
                  key={l.href}
                  href={l.href}
                  aria-current={on ? 'page' : undefined}
                  style={{
                    display: 'block',
                    padding: '7px 10px',
                    margin: '1px 0',
                    borderRadius: 7,
                    textDecoration: 'none',
                    fontWeight: on ? 650 : 500,
                    color: on ? COLORS.onSurfaceDark : COLORS.onSurfaceDarkMuted,
                    background: on ? COLORS.surfaceDarkRaised : 'transparent',
                    boxShadow: on ? `inset 3px 0 0 ${BRAND.gold}` : undefined,
                  }}
                >
                  {l.label}
                </a>
              );
            })}
          </div>
        ))}
      </nav>
      <div
        style={{
          padding: '14px 18px 18px',
          borderTop: `1px solid ${COLORS.surfaceDarkRaised}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        <span style={{ color: COLORS.onSurfaceDark, fontWeight: 600, overflow: 'hidden' }}>
          @{username}
        </span>
        <SignOutButton />
      </div>
    </aside>
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
        background: 'transparent',
        color: COLORS.onSurfaceDarkMuted,
        border: `1px solid ${COLORS.surfaceDarkRaised}`,
        borderRadius: 7,
        padding: '5px 10px',
        fontSize: 12,
        fontWeight: 600,
        fontFamily: 'inherit',
        cursor: 'pointer',
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
