import { NextResponse } from 'next/server';
import { registerRequestSchema } from '@jax/shared';
import { register } from '@/server/auth/service';
import { ipSubject } from '@/server/client-ip';
import { route } from '@/server/http';
import { resolveInstallation } from '@/server/installations';
import { parseBody } from '@/server/validate';

export const POST = route(async (req) => {
  const input = await parseBody(req, registerRequestSchema);
  const result = await register(input, {
    ipSubject: ipSubject(req),
    installation: await resolveInstallation(req),
  });
  return NextResponse.json(result, { status: 202 });
});
