import { NextResponse } from 'next/server';
import { usernameChangeSchema } from '@jax/shared';
import { changeUsername } from '@/server/auth/account';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { meView } from '@/server/profiles';
import { enforce } from '@/server/rate-limit';
import { parseBody } from '@/server/validate';

/** P4.9: change your username. Cooldown applies; your account ID and history stay the same. */
export const PATCH = route(async (req) => {
  const { user } = await requireUser(req);
  const { username } = await parseBody(req, usernameChangeSchema);
  await enforce([
    { key: `profile:user:${user.id}`, limitKey: 'rateLimit.profile.perMinute', windowSeconds: 60 },
  ]);
  const updated = await changeUsername(user, username);
  return NextResponse.json({ user: await meView(updated) });
});
