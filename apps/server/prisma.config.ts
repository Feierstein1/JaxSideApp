import path from 'node:path';
import { existsSync } from 'node:fs';
import { defineConfig } from 'prisma/config';
import { findRepoRoot } from './src/server/repo-root.ts';

// Prisma 7 doesn't auto-load .env. Load the shared root file without overriding
// variables already set (so test scripts can point DATABASE_URL at jax_test).
const envFile = path.join(findRepoRoot(), '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
