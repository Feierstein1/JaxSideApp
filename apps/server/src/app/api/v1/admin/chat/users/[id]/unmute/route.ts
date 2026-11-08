import { NextResponse } from 'next/server';
import { chatUnmuteSchema } from '@jax/shared';
import { audit } from '@/server/admin/audit';
import { requireAdmin } from '@/server/admin/auth';
import { adminUnmuteChatUser } from '@/server/admin/chat';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D218: lift a person's area-chat mute early. Audited. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const userId = await uuidParam(ctx);
  const input = await parseBody(req, chatUnmuteSchema);
  await adminRateLimit(admin.id);
  await adminUnmuteChatUser(userId);
  await audit(admin.id, 'CHAT_UNMUTE', { type: 'user', id: userId }, { reason: input.reason });
  return NextResponse.json({ ok: true });
});
