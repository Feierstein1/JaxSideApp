import { NextResponse } from 'next/server';
import { guestStatus } from '@/server/auth/guests';
import { requireActor } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { meView } from '@/server/profiles';

export const dynamic = 'force-dynamic';

/** Who the app is signed in as: a registered user, or a guest with its expiry (P4.4). */
export const GET = route(async (req) => {
  const actor = await requireActor(req);
  if (actor.kind === 'guest') {
    return NextResponse.json({ kind: 'guest', guest: await guestStatus(actor.guest) });
  }
  return NextResponse.json({ kind: 'user', user: await meView(actor.user) });
});
