#!/usr/bin/env node
/**
 * D153: the admin portal on this PC, working on the staging server's data.
 *
 *   npm run admin:staging        then open http://localhost:3001/admin
 *
 * Opens an SSH tunnel to the server's database (it only listens on the server itself, and
 * SSH only accepts this PC's internet address), then starts a second copy of the portal
 * on port 3001 with the server's settings (deploy/staging/secrets/staging.env), pointed
 * through the tunnel. Photos and emails use the server's S3 bucket and email account.
 * Your usual dev server on port 3000 and its local data aren't touched. Ctrl+C closes both.
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const HOST = 'ubuntu@34.197.165.101';
const KEY = path.join(os.homedir(), '.ssh', 'jaxside-staging.pem');
const LOCAL_DB_PORT = 15432;
const PORTAL_PORT = 3001;
const settingsFile = path.join(root, 'deploy/staging/secrets/staging.env');

if (!existsSync(settingsFile)) throw new Error(`Missing ${settingsFile}`);
if (!existsSync(KEY)) throw new Error(`Missing the server key ${KEY}`);
const settings = Object.fromEntries(
  readFileSync(settingsFile, 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i), l.slice(i + 1).replace(/^"(.*)"$/, '$1')];
    }),
);

const env = {
  ...process.env,
  ...settings,
  // Through the tunnel instead of the server's internal network.
  DATABASE_URL: `postgresql://${settings.POSTGRES_USER}:${settings.POSTGRES_PASSWORD}@127.0.0.1:${LOCAL_DB_PORT}/${settings.POSTGRES_DB}`,
  ADMIN_PORTAL_ENABLED: 'true',
  TRUST_PROXY: 'false',
  NEXT_DIST_DIR: '.next-admin',
};
delete env.NODE_ENV; // `next dev` sets it

const children = [];
const stop = () => {
  for (const c of children) if (!c.killed) c.kill();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

console.log('Opening the tunnel to the staging database…');
const tunnel = spawn(
  'ssh',
  [
    '-N',
    '-i',
    KEY,
    '-o',
    'ExitOnForwardFailure=yes',
    '-o',
    'ServerAliveInterval=30',
    '-L',
    `${LOCAL_DB_PORT}:127.0.0.1:5432`,
    HOST,
  ],
  { stdio: 'inherit' },
);
children.push(tunnel);
tunnel.on('exit', (code) => {
  console.error(`The tunnel closed (exit ${code}). Is this PC's internet address still allowed?`);
  stop();
});

const ready = await new Promise((resolve) => {
  let tries = 0;
  const check = () => {
    const s = net.connect(LOCAL_DB_PORT, '127.0.0.1');
    s.on('connect', () => (s.destroy(), resolve(true)));
    s.on('error', () => (++tries > 40 ? resolve(false) : setTimeout(check, 500)));
  };
  check();
});
if (!ready) {
  console.error('The tunnel didn’t open.');
  stop();
}

console.log(
  `Tunnel open. Starting the staging admin portal on http://localhost:${PORTAL_PORT}/admin`,
);
const portal = spawn('npx', ['next', 'dev', '-p', String(PORTAL_PORT)], {
  cwd: path.join(root, 'apps/server'),
  env,
  stdio: 'inherit',
  shell: true,
});
children.push(portal);
portal.on('exit', stop);
