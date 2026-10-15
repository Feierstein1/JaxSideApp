import { NextResponse } from 'next/server';
import { emptyBodySchema } from '@jax/shared';
import { guestStatus, startGuestSession } from '@/server/auth/guests';
import { ipSubject } from '@/server/client-ip';
import { route } from '@/server/http';
import { resolveInstallation } from '@/server/installations';
import { parseBody } from '@/server/validate';

/**
 * P4.1: start (or resume) guest mode on this app installation. The guest token is used
 * like a session token; the internal guest ID is never returned (P4.3).
 */
export const POST = route(async (req) => {
  await parseBody(req, emptyBodySchema);
  const { token, guest } = await startGuestSession(await resolveInstallation(req), ipSubject(req));
  return NextResponse.json({ token, guest: await guestStatus(guest) }, { status: 201 });
});
