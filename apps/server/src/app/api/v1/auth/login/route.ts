import { NextResponse } from 'next/server';
import { loginRequestSchema } from '@jax/shared';
import { login } from '@/server/auth/service';
import { ipSubject } from '@/server/client-ip';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

export const POST = route(async (req) => {
  const input = await parseBody(req, loginRequestSchema);
  return NextResponse.json(await login(input, { ipSubject: ipSubject(req) }));
});
