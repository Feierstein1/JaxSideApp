import Link from 'next/link';
import type { ReactNode } from 'react';
import { COLORS } from '@jax/shared';
import { TEXT } from '@/text';

export const metadata = {
  title: TEXT.siteName,
  robots: { index: false, follow: false },
  icons: { icon: '/brand/favicon.png' },
};

/**
 * Every page: the JaxSide header (the app's black band with the small mark, D33 colors:
 * white on black) over a light page. The brand images are copies of the app's
 * (`apps/mobile/assets`), kept in `public/brand` so this site stands alone.
 */
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
        <header style={{ background: COLORS.surfaceInverse, color: COLORS.onSurfaceInverse }}>
          <Link
            href="/"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              maxWidth: 1000,
              margin: '0 auto',
              padding: '10px 16px',
              color: COLORS.onSurfaceInverse,
              textDecoration: 'none',
              fontWeight: 800,
              letterSpacing: 0.2,
            }}
          >
            <img
              src="/brand/mark-small.svg"
              alt=""
              width={32}
              height={32}
              style={{ borderRadius: 6 }}
            />
            {TEXT.siteName}
          </Link>
        </header>
        {children}
      </body>
    </html>
  );
}
