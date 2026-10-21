import { NextResponse } from 'next/server';
import { profileUpdateSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { db } from '@/server/db';
import { route } from '@/server/http';
import { screenText } from '@/server/moderation/screening';
import { meView } from '@/server/profiles';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/** P4.8 (early): edit your own public bio. Plain text (P3.10); empty clears it. */
export const PATCH = route(async (req) => {
  const { user } = await requireUser(req);
  const input = await parseBody(req, profileUpdateSchema);
  const { bio } = input;
  await enforce([
    { key: `profile:user:${user.id}`, limitKey: 'rateLimit.profile.perMinute', windowSeconds: 60 },
  ]);
  if (bio) await screenText(bio, 'bio', input);
  await db.profile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, bio: bio || null },
    update: { bio: bio || null },
  });
  return NextResponse.json({ user: await meView(user) });
});
