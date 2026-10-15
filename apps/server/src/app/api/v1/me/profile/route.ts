import { NextResponse } from 'next/server';
import { profileUpdateSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { decryptUserEmail } from '@/server/crypto/field-encryption';
import { db } from '@/server/db';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { toMe } from '@/server/serializers';
import { parseBody } from '@/server/validate';

/** P4.8 (early): edit your own public bio. Plain text (P3.10); empty clears it. */
export const PATCH = route(async (req) => {
  const { user } = await requireUser(req);
  const { bio } = await parseBody(req, profileUpdateSchema);
  await enforce([
    { key: `profile:user:${user.id}`, limitKey: 'rateLimit.profile.perMinute', windowSeconds: 60 },
  ]);
  const profile = await db.profile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, bio: bio || null },
    update: { bio: bio || null },
  });
  return NextResponse.json({ user: toMe({ ...user, profile, email: decryptUserEmail(user) }) });
});
