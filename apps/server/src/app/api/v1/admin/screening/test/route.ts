import { NextResponse } from 'next/server';
import { screeningTestSchema } from '@jax/shared';
import { requireAdmin } from '@/server/admin/auth';
import { testText } from '@/server/admin/screening-rules';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** P15.9: try a sentence against the rules (nothing is saved). */
export const POST = route(async (req) => {
  const { admin } = await requireAdmin(req);
  const { text } = await parseBody(req, screeningTestSchema);
  await adminRateLimit(admin.id);
  return NextResponse.json(await testText(text));
});
