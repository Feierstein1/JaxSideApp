import { NextResponse } from 'next/server';
import { radiusPreferencesSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { getConfig } from '@/server/config';
import { db } from '@/server/db';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/**
 * P2.15: radius preferences. Users may narrow their radius but never widen it past
 * the server maximum (§7): values are clamped to the configured range.
 */
export const PATCH = route(async (req) => {
  const { user } = await requireUser(req);
  const input = await parseBody(req, radiusPreferencesSchema);
  await enforce([
    {
      key: `preferences:user:${user.id}`,
      limitKey: 'rateLimit.preferences.perMinute',
      windowSeconds: 60,
    },
  ]);
  const [gMin, gMax, bMin, bMax] = await Promise.all([
    getConfig('radius.general.minMiles'),
    getConfig('radius.general.maxMiles'),
    getConfig('radius.business.minMiles'),
    getConfig('radius.business.maxMiles'),
  ]);
  const data = {
    ...(input.generalRadiusMiles !== undefined && {
      generalRadiusMiles: clamp(input.generalRadiusMiles, gMin, gMax),
    }),
    ...(input.businessRadiusMiles !== undefined && {
      businessRadiusMiles: clamp(input.businessRadiusMiles, bMin, bMax),
    }),
  };
  const u = await db.user.update({
    where: { id: user.id },
    data,
    select: { generalRadiusMiles: true, businessRadiusMiles: true },
  });
  return NextResponse.json({
    generalRadiusMiles: u.generalRadiusMiles ?? (await getConfig('radius.general.defaultMiles')),
    businessRadiusMiles: u.businessRadiusMiles ?? (await getConfig('radius.business.defaultMiles')),
  });
});
