import type { ReactNode } from 'react';
import { COLORS } from '@jax/shared';
import { TEXT } from '@/text';

export const metadata = { title: TEXT.siteName, robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          fontFamily: 'system-ui, sans-serif',
          background: COLORS.surfaceMuted,
          color: COLORS.text,
        }}
      >
        {children}
      </body>
    </html>
  );
}
