import { NextResponse } from 'next/server';
import { adminCreateUserSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { adminCreateUser } from '@/server/admin/create-user';
import { adminRateLimit, listUsers, parseUserQuery } from '@/server/admin/users';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

export const dynamic = 'force-dynamic';

/** P5.14: find people by any part of the username; filter by strikes, banned, suspended. */
export const GET = route(async (req) => {
  await requireAdmin(req);
  return NextResponse.json(await listUsers(parseUserQuery(new URL(req.url).searchParams)));
});

/**
 * D273: add an account (username, password, optional email). Confirmed at once; optionally a
 * store review account (D268). Audited.
 */
export const POST = route(async (req) => {
  const { admin } = await requireAdmin(req);
  const input = await parseBody(req, adminCreateUserSchema);
  await adminRateLimit(admin.id);
  return NextResponse.json({ user: await adminCreateUser(admin.id, input) }, { status: 201 });
});
