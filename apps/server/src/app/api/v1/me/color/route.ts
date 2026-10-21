import { NextResponse } from 'next/server';
import { profileColorSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { db } from '@/server/db';
import { route } from '@/server/http';
import { meView } from '@/server/profiles';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/** D69: change your account color (one of the palette in @jax/shared). */
export const PATCH = route(async (req) => {
  const { user } = await requireUser(req);
  const { color } = await parseBody(req, profileColorSchema);
  await enforce([
    { key: `profile:user:${user.id}`, limitKey: 'rateLimit.profile.perMinute', windowSeconds: 60 },
  ]);
  // D108: the color lives on the profile.
  await db.profile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, color },
    update: { color },
  });
  return NextResponse.json({ user: await meView(user) });
});
