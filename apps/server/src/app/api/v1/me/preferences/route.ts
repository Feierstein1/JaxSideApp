import { NextResponse } from 'next/server';
import { radiusPreferencesSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { db } from '@/server/db';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/**
 * P2.15 / D71: your radius (0.1, 0.2 or 0.3 mi). One setting for the feed, the Places list
 * and business discussions; the server never allows more than 0.3 mi.
 */
export const PATCH = route(async (req) => {
  const { user } = await requireUser(req);
  const { radiusMiles } = await parseBody(req, radiusPreferencesSchema);
  await enforce([
    {
      key: `preferences:user:${user.id}`,
      limitKey: 'rateLimit.preferences.perMinute',
      windowSeconds: 60,
    },
  ]);
  const data = { generalRadiusMiles: radiusMiles, businessRadiusMiles: radiusMiles };
  await db.userSettings.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });
  return NextResponse.json({ radiusMiles });
});
