import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { notificationLimit } from '@/server/social/limits';
import { unreadCount } from '@/server/social/notifications';

export const dynamic = 'force-dynamic';

/** D76: the bell's badge. The app asks about every 30 s while open. */
export const GET = route(async (req) => {
  const { user } = await requireUser(req);
  await notificationLimit(user.id);
  return NextResponse.json({ unread: await unreadCount(user.id) });
});
