import { NextResponse } from 'next/server';
import { appealCreateSchema } from '@jax/shared';
import { requireUser } from '@/server/auth/require-actor';
import { route } from '@/server/http';
import { createAppeal } from '@/server/moderation/appeals';
import { parseBody } from '@/server/validate';

/** P5.7: appeal a warning (or other strike) while signed in. */
export const POST = route(async (req) => {
  const { user } = await requireUser(req);
  const input = await parseBody(req, appealCreateSchema);
  await createAppeal(user, input);
  return NextResponse.json({ status: 'received' }, { status: 201 });
});
