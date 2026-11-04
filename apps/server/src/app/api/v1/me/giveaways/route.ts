import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { myWins } from '@/server/giveaways';
import { route } from '@/server/http';

export const dynamic = 'force-dynamic';

/** D188: your giveaway wins (your own email shown masked, to check it's right). */
export const GET = route(async (req) => {
  const { user } = await requireUser(req);
  return NextResponse.json({ wins: await myWins(user.id) });
});
