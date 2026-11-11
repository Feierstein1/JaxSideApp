import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { ensureEventReminders } from '@/server/events/notify';
import { route } from '@/server/http';
import { unreadChats } from '@/server/social/messages';
import { notificationLimit } from '@/server/social/limits';
import { unreadCount } from '@/server/social/notifications';

export const dynamic = 'force-dynamic';

/**
 * Q26: both top-bar badges in one request (chats with something unseen, and the bell), so
 * the app's 30 s check is one request and one rate-limit counter instead of two. The
 * separate /messages/unread and /notifications/unread stay for older app versions.
 * D230: it also makes any due reminders for events the person follows.
 */
export const GET = route(async (req) => {
  const { user } = await requireUser(req);
  await notificationLimit(user.id);
  // D230: followed-event reminders are made here (the app checks every 30 s while open).
  await ensureEventReminders(user.id);
  const [messages, notifications] = await Promise.all([unreadChats(user.id), unreadCount(user.id)]);
  return NextResponse.json({ messages, notifications });
});
