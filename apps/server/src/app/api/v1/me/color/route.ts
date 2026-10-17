import { NextResponse } from 'next/server';
import { profileColorSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { decryptUserEmail } from '@/server/crypto/field-encryption';
import { db } from '@/server/db';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { toMe } from '@/server/serializers';
import { parseBody } from '@/server/validate';

/** D69: change your account color (one of the palette in @jax/shared). */
export const PATCH = route(async (req) => {
  const { user } = await requireUser(req);
  const { color } = await parseBody(req, profileColorSchema);
  await enforce([
    { key: `profile:user:${user.id}`, limitKey: 'rateLimit.profile.perMinute', windowSeconds: 60 },
  ]);
  const updated = await db.user.update({
    where: { id: user.id },
    data: { profileColor: color },
    include: { profile: true },
  });
  return NextResponse.json({ user: toMe({ ...updated, email: decryptUserEmail(updated) }) });
});
