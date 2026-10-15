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
};

export default nextConfig;
