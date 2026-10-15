import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { revokeSession } from '@/server/auth/sessions';
import { route } from '@/server/http';

/** Signs out this device only. */
export const POST = route(async (req) => {
  const { session } = await requireUser(req);
  await revokeSession(session.id);
  return NextResponse.json({ status: 'signed_out' });
});
