import { NextResponse } from 'next/server';
import { restrictedAppealSchema } from '@jax/shared';
import { route } from '@/server/http';
import { createAppeal } from '@/server/moderation/appeals';
import { restrictedUser } from '@/server/moderation/restricted';
import { parseBody } from '@/server/validate';

/** P5.7: a banned or suspended person appeals (password instead of a session, D59). */
export const POST = route(async (req) => {
  const { identifier, password, actionId, message } = await parseBody(req, restrictedAppealSchema);
  const user = await restrictedUser(req, { identifier, password });
  await createAppeal(user, { actionId, message });
  return NextResponse.json({ status: 'received' }, { status: 201 });
});
