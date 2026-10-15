// Rebuilds the TEST database from migrations. Destroys all data in it.
// Run this yourself: npm run db:test:reset -w @jax/server
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '../../..');
const envFile = path.join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env.TEST_DATABASE_URL;
if (!url) throw new Error('TEST_DATABASE_URL is not set');
const dbName = new URL(url).pathname.slice(1);
if (!dbName.endsWith('_test')) throw new Error(`Refusing: "${dbName}" does not end with _test`);

console.log(`Resetting test database "${dbName}"...`);
execSync('npx prisma migrate reset --force', {
  cwd: path.resolve(import.meta.dirname, '..'),
  env: { ...process.env, DATABASE_URL: url },
  stdio: 'inherit',
});
