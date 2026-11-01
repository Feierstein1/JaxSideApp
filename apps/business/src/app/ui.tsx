import type { CSSProperties, ReactNode } from 'react';
import { COLORS } from '@jax/shared';

/** Small shared styles for the site's forms (colors only from COLORS, D33). */
export const ui = {
  input: {
    display: 'block',
    width: '100%',
    boxSizing: 'border-box',
    padding: '10px 12px',
    marginTop: 6,
    border: `1px solid ${COLORS.border}`,
    borderRadius: 8,
    fontSize: 16,
  },
  label: { display: 'block', marginTop: 16 },
  primary: {
    marginTop: 20,
    width: '100%',
    padding: '12px 16px',
    border: 0,
    borderRadius: 8,
    background: COLORS.primary,
    color: COLORS.onPrimary,
    fontSize: 16,
    cursor: 'pointer',
  },
  secondary: {
    padding: '10px 18px',
    borderRadius: 8,
    border: `1px solid ${COLORS.border}`,
    background: COLORS.background,
    color: COLORS.text,
    cursor: 'pointer',
  },
  error: { color: COLORS.error },
  muted: { color: COLORS.textMuted },
} satisfies Record<string, CSSProperties>;

export function Card({ children, width = 400 }: { children: ReactNode; width?: number }) {
  return (
    <main style={{ maxWidth: width, margin: '0 auto', padding: '64px 16px' }}>
      <div
        style={{
          background: COLORS.background,
          border: `1px solid ${COLORS.cardBorder}`,
          borderRadius: 12,
          padding: 24,
        }}
      >
        {children}
      </div>
    </main>
  );
}
