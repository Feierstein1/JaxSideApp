'use client';

import { usePathname } from 'next/navigation';
import { BRAND, COLORS } from '@jax/shared';
import { adminFetch, Brand, type NavGroup } from './admin-ui';

/*
 * The portal's client-only pieces. Kept out of admin-ui.tsx: a 'use client' module hands
 * server pages a reference instead of its objects, so `ui` would be empty there.
 */

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
