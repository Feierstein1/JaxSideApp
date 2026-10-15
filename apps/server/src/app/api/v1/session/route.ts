import { NextResponse } from 'next/server';
import { guestStatus } from '@/server/auth/guests';
import { requireActor } from '@/server/auth/require-actor';
import { decryptUserEmail } from '@/server/crypto/field-encryption';
import { db } from '@/server/db';
import { route } from '@/server/http';
import { toMe } from '@/server/serializers';

export const dynamic = 'force-dynamic';

/** Who the app is signed in as: a registered user, or a guest with its expiry (P4.4). */
export const GET = route(async (req) => {
  const actor = await requireActor(req);
  if (actor.kind === 'guest') {
    return NextResponse.json({ kind: 'guest', guest: await guestStatus(actor.guest) });
  }
  const profile = await db.profile.findUnique({ where: { userId: actor.user.id } });
  return NextResponse.json({
    kind: 'user',
    user: toMe({ ...actor.user, profile, email: decryptUserEmail(actor.user) }),
  });
});
