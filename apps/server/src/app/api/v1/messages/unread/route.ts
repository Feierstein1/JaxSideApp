import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { messageReadLimit } from '@/server/social/message-limits';
import { unreadChats } from '@/server/social/messages';

export const dynamic = 'force-dynamic';

/** D97: how many chats have a message you haven't seen (the top-bar badge). */
export const GET = route(async (req) => {
  const { user } = await requireUser(req);
  await messageReadLimit(user.id);
  return NextResponse.json({ unread: await unreadChats(user.id) });
});
