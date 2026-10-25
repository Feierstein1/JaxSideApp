import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAdmin } from '@/server/admin/auth';
import { audit } from '@/server/admin/audit';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { decidePollSuggestion } from '@/server/polls';
import { parseBody } from '@/server/validate';

const schema = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('use') }),
  z.strictObject({ action: z.literal('reject'), reason: z.string().trim().min(3).max(300) }),
]);

/** D133: mark a suggested poll question used, or decline it with a reason. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const input = await parseBody(req, schema);
  await adminRateLimit(admin.id);
  await decidePollSuggestion(id, input);
  await audit(admin.id, `POLL_SUGGESTION_${input.action.toUpperCase()}`, {
    type: 'poll-suggestion',
    id,
  });
  return NextResponse.json({ ok: true });
});
