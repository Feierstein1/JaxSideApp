#!/usr/bin/env node
/**
 * D154: publish an over-the-air update (JavaScript and images only) to installed apps.
 *
 *   npm run update:staging -w @jax/mobile -- "Fix the map button"
 *   npm run update:production -w @jax/mobile -- "Fix the map button"
 *
 * Sets the server address for that channel itself, so an update can never go out pointed at
 * this PC's development server (apps/mobile/.env). Apps get it the next time they open
 * (it applies on the launch after that). Changes to native code need a new store build;
 * the fingerprint runtime version keeps updates from reaching builds they don't fit.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const API = {
  staging: 'https://staging-api.jaxside.com',
  production: 'https://api.jaxside.com',
};
const [channel, ...words] = process.argv.slice(2);
if (!(channel in API)) {
  console.error('Usage: node scripts/ota.mjs <staging|production> "what changed"');
  process.exit(2);
}
const message = words.join(' ').trim();
if (!message) {
  console.error('Say what changed, e.g. "Fix the map button"');
  process.exit(2);
}
const r = spawnSync(
  'npx',
  [
    'eas-cli',
    'update',
    '--channel',
    channel,
    '--message',
    JSON.stringify(message),
    '--non-interactive',
  ],
  {
    cwd: path.resolve(import.meta.dirname, '..'),
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, EXPO_PUBLIC_API_URL: API[channel] },
  },
);
process.exit(r.status ?? 1);
