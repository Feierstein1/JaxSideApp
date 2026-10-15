import type { NextConfig } from 'next';
import { loadEnvConfig } from '@next/env';
import { findRepoRoot } from './src/server/repo-root.ts';

// One .env at the repo root is shared by docker compose and the server.
// forceReload: Next has already loaded (empty) env from apps/server and caches it.
loadEnvConfig(findRepoRoot(), process.env.NODE_ENV !== 'production', undefined, true);

const nextConfig: NextConfig = {
  transpilePackages: ['@jax/shared'],
  serverExternalPackages: ['pino'],
  poweredByHeader: false,
  // The dev request log prints full URLs; these pages carry single-use tokens.
  logging: { incomingRequests: { ignore: [/\/verify-email/, /\/reset-password/] } },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          // Email links carry tokens in the URL; never leak them via Referer.
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
