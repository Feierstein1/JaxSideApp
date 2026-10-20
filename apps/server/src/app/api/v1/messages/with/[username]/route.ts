import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { usernameFrom, type UsernameCtx } from '@/server/profiles';
import { messageReadLimit } from '@/server/social/message-limits';
import { chatWith } from '@/server/social/messages';

export const dynamic = 'force-dynamic';

/** D97: your chat with someone (newest 50, or older with `before`). Opening it marks it read. */
export const GET = route<UsernameCtx>(async (req, ctx) => {
  const { user } = await requireUser(req);
  const username = await usernameFrom(ctx);
  await messageReadLimit(user.id);
  const before = new URL(req.url).searchParams.get('before') ?? undefined;
  return NextResponse.json(await chatWith(user.id, username, before));
});
