import { NextResponse } from 'next/server';
import { emptyBodySchema } from '@jax/shared';
import { ipSubject } from '@/server/client-ip';
import { route } from '@/server/http';
import { createInstallation } from '@/server/installations';
import { parseBody } from '@/server/validate';

/** P2.7: the app calls this once, on first launch, and keeps the token in secure storage. */
export const POST = route(async (req) => {
  await parseBody(req, emptyBodySchema);
  return NextResponse.json(await createInstallation(ipSubject(req)), { status: 201 });
});
