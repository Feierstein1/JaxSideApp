import { NextResponse } from 'next/server';
import { markNotificationsReadSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { notificationLimit } from '@/server/social/limits';
import { markAllRead } from '@/server/social/notifications';
import { parseBody } from '@/server/validate';

/** D76: mark all your notifications read (opening the bell does this). */
export const POST = route(async (req) => {
  const { user } = await requireUser(req);
  await parseBody(req, markNotificationsReadSchema);
  await notificationLimit(user.id);
  await markAllRead(user.id);
  return NextResponse.json({ ok: true });
});
