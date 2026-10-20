import { appendFile, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { clientIp } from '@/server/client-ip';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { findRepoRoot } from '@/server/repo-root';
import { parseBody } from '@/server/validate';

/**
 * D100 (temporary, development only): the app sends its errors here so they can be read
 * on this computer (`apps/server/logs/client.log`, git-ignored). Off unless the server is
 * in development or CLIENT_LOGS=1, so it never runs in production by accident. No account
 * data is written: only the message, where in the app it happened, and the time.
 */

const schema = z.strictObject({
  level: z.enum(['error', 'warn', 'info']),
  message: z.string().max(4000),
  where: z.string().max(200).optional(),
  details: z.string().max(8000).optional(),
  platform: z.string().max(40).optional(),
});

const MAX_BYTES = 5 * 1024 * 1024;

export const POST = route(async (req) => {
  const enabled = process.env.NODE_ENV !== 'production' || process.env.CLIENT_LOGS === '1';
  if (!enabled) return new Response('Not found', { status: 404 });
  const input = await parseBody(req, schema);
  await enforce([
    {
      key: `client-log:ip:${clientIp(req)}`,
      limitKey: 'rateLimit.clientLog.perMinute',
      windowSeconds: 60,
    },
  ]);
  const dir = path.join(findRepoRoot(), 'apps/server/logs');
  const file = path.join(dir, 'client.log');
  await mkdir(dir, { recursive: true });
  // Keep it small: start over past 5 MB.
  const size = await stat(file).then(
    (s) => s.size,
    () => 0,
  );
  if (size > MAX_BYTES) await writeFile(file, '');
  await appendFile(file, JSON.stringify({ at: new Date().toISOString(), ...input }) + '\n');
  return NextResponse.json({ ok: true });
});
