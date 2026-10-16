import type { CSSProperties, ReactNode } from 'react';
import { COLORS } from '@jax/shared';

/** Simple tables and labels for the portal pages (server components). */
export const th: CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: `2px solid ${COLORS.cardBorder}`,
  fontSize: 13,
  color: COLORS.textMuted,
};
export const td: CSSProperties = {
  padding: '10px',
  borderBottom: `1px solid ${COLORS.cardBorder}`,
  verticalAlign: 'top',
};

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        background: COLORS.background,
        border: `1px solid ${COLORS.cardBorder}`,
      }}
    >
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
  );
}

export function Pill({
  children,
  tone = 'muted',
}: {
  children: ReactNode;
  tone?: 'muted' | 'alert' | 'ok';
}) {
  const bg = tone === 'alert' ? COLORS.error : tone === 'ok' ? COLORS.primary : COLORS.surfaceMuted;
  const fg = tone === 'muted' ? COLORS.text : COLORS.onPrimary;
  return (
    <span
      style={{
        background: bg,
        color: fg,
        borderRadius: 10,
        padding: '2px 8px',
        fontSize: 12,
        marginRight: 4,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </span>
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
