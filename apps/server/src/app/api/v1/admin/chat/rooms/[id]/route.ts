import { NextResponse } from 'next/server';
import { chatRoomAdminSchema } from '@jax/shared';
import { audit } from '@/server/admin/audit';
import { requireAdmin } from '@/server/admin/auth';
import { adminSetChatRoom } from '@/server/admin/chat';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { route } from '@/server/http';
import { parseBody } from '@/server/validate';

/** D218: switch a chat room on or off, or give it a name. Audited. */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const roomId = await uuidParam(ctx);
  const input = await parseBody(req, chatRoomAdminSchema);
  await adminRateLimit(admin.id);
  await adminSetChatRoom(roomId, input);
  await audit(
    admin.id,
    `CHAT_ROOM_${input.action.toUpperCase()}`,
    { type: 'chat_room', id: roomId },
    { reason: input.reason, ...(input.action === 'rename' ? { name: input.displayName } : {}) },
  );
  return NextResponse.json({ ok: true });
});
