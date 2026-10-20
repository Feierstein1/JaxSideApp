import { NextResponse } from 'next/server';
import { z } from 'zod';
import { GUIDE_KEYS, GUIDES } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { db } from '@/server/db';
import { ApiError, route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

export const dynamic = 'force-dynamic';

/**
 * D104: which first-time guides you've finished, per account (so a new phone or a
 * reinstall doesn't show them again). A guide whose version went up shows once more.
 */
export const GET = route(async (req) => {
  const { user } = await requireUser(req);
  const rows = await db.guideSeen.findMany({ where: { userId: user.id } });
  return NextResponse.json({
    seen: Object.fromEntries(rows.map((r) => [r.guideKey, r.version])),
  });
});

const schema = z.strictObject({ key: z.enum(GUIDE_KEYS) });

/** D104: "Got it" on a guide: remember it (at the guide's current version). */
export const POST = route(async (req) => {
  const { user } = await requireUser(req);
  const { key } = await parseBody(req, schema);
  await enforce([
    {
      key: `guides:user:${user.id}`,
      limitKey: 'rateLimit.preferences.perMinute',
      windowSeconds: 60,
    },
  ]);
  const guide = GUIDES[key];
  if (!guide) throw new ApiError(404, 'NOT_FOUND', 'Unknown guide');
  await db.guideSeen.upsert({
    where: { userId_guideKey: { userId: user.id, guideKey: key } },
    create: { userId: user.id, guideKey: key, version: guide.version },
    update: { version: guide.version, seenAt: new Date() },
  });
  return NextResponse.json({ ok: true });
});
