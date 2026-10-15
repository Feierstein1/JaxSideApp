import { NextResponse } from 'next/server';
import { db } from '@/server/db';
import { route } from '@/server/http';
import { logger } from '@/server/logger';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  let database: 'ok' | 'down' = 'ok';
  try {
    await db.$queryRaw`SELECT 1`;
  } catch (err) {
    logger.error({ err }, 'health: database unreachable');
    database = 'down';
  }
  const status = database === 'ok' ? 'ok' : 'degraded';
  return NextResponse.json(
    { status, database, time: new Date().toISOString() },
    { status: status === 'ok' ? 200 : 503 },
  );
});
