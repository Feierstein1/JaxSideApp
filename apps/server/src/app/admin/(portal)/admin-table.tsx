import type { CSSProperties, ReactNode } from 'react';
import { COLORS } from '@jax/shared';

/** Simple tables, labels and stat tiles for the portal pages (server components). */
export const th: CSSProperties = {
  textAlign: 'left',
  padding: '10px 14px',
  background: COLORS.surfaceMuted,
  borderBottom: `1px solid ${COLORS.cardBorder}`,
  fontSize: 12,
  fontWeight: 650,
  letterSpacing: '0.04em',
  textTransform: 'uppercase',
  color: COLORS.textMuted,
  whiteSpace: 'nowrap',
};
export const td: CSSProperties = {
  padding: '12px 14px',
  borderBottom: `1px solid ${COLORS.hairline}`,
  verticalAlign: 'top',
  transition: 'background 120ms',
};

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div
      style={{
        background: COLORS.background,
        border: `1px solid ${COLORS.cardBorder}`,
        borderRadius: 12,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 2px 6px rgba(0,0,0,0.05)',
        overflowX: 'auto',
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={`${h}-${i}`} style={th}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

const PILL: Record<'muted' | 'alert' | 'ok', { bg: string; fg: string }> = {
  ok: { bg: COLORS.primarySoft, fg: COLORS.primary },
  alert: { bg: COLORS.errorSoft, fg: COLORS.error },
  muted: { bg: COLORS.hairline, fg: COLORS.textMuted },
};

export function Pill({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'alert' | 'ok';
}) {
  const c = PILL[tone];
  return (
    <span
      className="adm-pill"
      style={{
        display: 'inline-block',
        background: c.bg,
        color: c.fg,
        borderRadius: 999,
        padding: '2px 10px',
        fontSize: 12,
        fontWeight: 600,
        lineHeight: 1.6,
        marginRight: 4,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
  );
}

/** A big number with its label; a link when `href` is given. */
export function StatTile({
  value,
  label,
  href,
  alert,
}: {
  value: ReactNode;
  label: string;
  href?: string;
  /** Tints the edge red (something is waiting). */
  alert?: boolean;
}) {
  const style: CSSProperties = {
    display: 'block',
    background: COLORS.background,
    border: `1px solid ${COLORS.cardBorder}`,
    borderTop: `4px solid ${alert ? COLORS.error : COLORS.primary}`,
    borderRadius: 12,
    padding: '16px 18px',
    color: COLORS.text,
    textDecoration: 'none',
    boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 2px 6px rgba(0,0,0,0.05)',
  };
  const body = (
    <>
      <div style={{ color: COLORS.textMuted, fontSize: 13, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 700, lineHeight: 1.2, marginTop: 6 }}>{value}</div>
    </>
  );
  return href ? (
    <a href={href} style={style}>
      {body}
    </a>
  ) : (
    <div style={style}>{body}</div>
  );
}

/** A responsive grid of StatTiles. */
export function StatGrid({ children, min = 190 }: { children: ReactNode; min?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fit, minmax(${min}px, 1fr))`,
        gap: 14,
        marginBottom: 22,
      }}
    >
      {children}
    </div>
  );
}

export const when = (iso: string) =>
  new Date(iso).toLocaleString('en-US', {
    timeZone: 'America/New_York',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

export const words = (s: string) => s.toLowerCase().replaceAll('_', ' ');

/** A link to `base` with the current query string, some values changed (empty ones dropped). */
export function hrefWith(
  base: string,
  params: Record<string, string | undefined>,
  patch: Record<string, string | number | undefined>,
) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...params, ...patch })) {
    if (v !== undefined && v !== '' && !(k.endsWith('page') && String(v) === '1')) {
      p.set(k, String(v));
    }
  }
  const s = p.toString();
  return s ? `${base}?${s}` : base;
}

/**
 * D210: "1–20 of 345" and Previous / Next for a paged list. `param` names the page in the
 * query string (a page with two lists uses two names); the other values are kept.
 */
export function Pager({
  page,
  base,
  params,
  param = 'page',
}: {
  page: { page: number; pages: number; total: number; pageSize: number };
  base: string;
  params: Record<string, string | undefined>;
  param?: string;
}) {
  if (page.total === 0) return null;
  const first = (page.page - 1) * page.pageSize + 1;
  const last = Math.min(page.page * page.pageSize, page.total);
  const link = (n: number) => hrefWith(base, params, { [param]: n });
  return (
    <nav
      aria-label="Pages"
      style={{
        display: 'flex',
        gap: 14,
        alignItems: 'center',
        flexWrap: 'wrap',
        margin: '12px 0 4px',
        fontSize: 13,
      }}
    >
      <span style={{ color: COLORS.textMuted }}>
        {first}–{last} of {page.total.toLocaleString('en-US')}
      </span>
      {page.pages > 1 ? (
        <>
          {page.page > 1 ? <a href={link(page.page - 1)}>← Previous</a> : null}
          <span style={{ color: COLORS.textMuted }}>
            Page {page.page} of {page.pages}
          </span>
          {page.page < page.pages ? <a href={link(page.page + 1)}>Next →</a> : null}
        </>
      ) : null}
    </nav>
  );
}

/** Pill-shaped links that switch between views of a page (the current one filled). */
export function Tabs({ items }: { items: { href: string; label: string; on: boolean }[] }) {
  return (
    <nav
      aria-label="Show"
      style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '0 0 16px' }}
    >
      {items.map((t) => (
        <a
          key={t.href}
          href={t.href}
          aria-current={t.on ? 'page' : undefined}
          style={{
            padding: '6px 14px',
            borderRadius: 999,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
            background: t.on ? COLORS.primary : COLORS.surfaceMuted,
            color: t.on ? COLORS.onPrimary : COLORS.text,
            border: `1px solid ${t.on ? COLORS.primary : COLORS.cardBorder}`,
          }}
        >
          {t.label}
        </a>
      ))}
    </nav>
  );
}
