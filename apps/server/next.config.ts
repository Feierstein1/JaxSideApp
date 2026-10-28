import { networkInterfaces } from 'node:os';
import type { NextConfig } from 'next';
import { loadEnvConfig } from '@next/env';
import { findRepoRoot } from './src/server/repo-root.ts';

// One .env at the repo root is shared by docker compose and the server.
// forceReload: Next has already loaded (empty) env from apps/server and caches it.
loadEnvConfig(findRepoRoot(), process.env.NODE_ENV !== 'production', undefined, true);

/**
 * Dev only: this machine's private LAN IPv4 addresses. Next 16 blocks its dev scripts
 * for any host other than localhost, which broke pages opened from a phone on the Wi-Fi.
 * Has no effect on production builds.
 */
function lanAddresses(): string[] {
  return Object.values(networkInterfaces())
    .flat()
    .filter((a) => a && a.family === 'IPv4' && !a.internal)
    .map((a) => a!.address)
    .filter((ip) => /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip));
}

const nextConfig: NextConfig = {
  // D153: the staging admin portal (npm run admin:staging) runs a second dev server next to
  // the usual one, so it builds into its own folder.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  allowedDevOrigins: lanAddresses(),
  experimental: {
    // Dev only: Next's built-in MCP endpoint copies browser console output into
    // .next/dev/logs, and on Windows the dev watcher picks that file up as a change, so an
    // open page reloaded itself in a loop (the admin portal). We don't use the endpoint.
    mcpServer: false,
  },
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
