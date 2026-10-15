import { NextResponse } from 'next/server';
import { usernameChangeSchema } from '@jax/shared';
import { changeUsername } from '@/server/auth/account';
import { requireUser } from '@/server/auth/require-actor';
import { decryptUserEmail } from '@/server/crypto/field-encryption';
import { db } from '@/server/db';
import { route } from '@/server/http';
import { enforce } from '@/server/rate-limit';
import { toMe } from '@/server/serializers';
import { parseBody } from '@/server/validate';

/** P4.9: change your username. Cooldown applies; your account ID and history stay the same. */
export const PATCH = route(async (req) => {
  const { user } = await requireUser(req);
  const { username } = await parseBody(req, usernameChangeSchema);
  await enforce([
    { key: `profile:user:${user.id}`, limitKey: 'rateLimit.profile.perMinute', windowSeconds: 60 },
  ]);
  const updated = await changeUsername(user, username);
  const profile = await db.profile.findUnique({ where: { userId: user.id } });
  return NextResponse.json({
    user: toMe({ ...updated, profile, email: decryptUserEmail(updated) }),
  });
});
