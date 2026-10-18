import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { notificationLimit } from '@/server/social/limits';
import { listNotifications } from '@/server/social/notifications';

export const dynamic = 'force-dynamic';

/** D76: your notifications, newest first. */
export const GET = route(async (req) => {
  const { user } = await requireUser(req);
  await notificationLimit(user.id);
  return NextResponse.json({ notifications: await listNotifications(user.id) });
});
