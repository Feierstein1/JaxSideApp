import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { revokeAllSessions } from '@/server/auth/sessions';
import { route } from '@/server/http';

/** Signs out everywhere: revokes every session for the caller, including this one. */
export const DELETE = route(async (req) => {
  const { user } = await requireUser(req);
  const revoked = await revokeAllSessions(user.id);
  return NextResponse.json({ status: 'signed_out_everywhere', revoked });
});
