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
