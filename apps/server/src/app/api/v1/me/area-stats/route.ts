import { NextResponse } from 'next/server';
import { areaStatsPreferenceSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { db } from '@/server/db';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/** D116: "Leave me out of area statistics" (Account → Settings). */
export const PATCH = route(async (req) => {
  const { user } = await requireUser(req);
  const { optOut } = await parseBody(req, areaStatsPreferenceSchema);
  await enforce([
    {
      key: `preferences:user:${user.id}`,
      limitKey: 'rateLimit.preferences.perMinute',
      windowSeconds: 60,
    },
  ]);
  await db.userSettings.upsert({
    where: { userId: user.id },
    create: { userId: user.id, areaStatsOptOut: optOut },
    update: { areaStatsOptOut: optOut },
  });
  return NextResponse.json({ optOut });
});
