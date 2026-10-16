import { requireAdmin } from '@/server/admin/auth';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { db } from '@/server/db';
import { route } from '@/server/http';
import { objectStore } from '@/server/media/store';

export const dynamic = 'force-dynamic';

/** P6.5: moderators can see a reported photo, including after it's removed. */
export const GET = route<IdParams>(async (req, ctx) => {
  await requireAdmin(req);
  const p = await db.photo.findUnique({ where: { id: await uuidParam(ctx) } });
  const body = p?.storageKey ? await objectStore().get(p.storageKey) : null;
  if (!body) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': p!.mimeType ?? 'image/jpeg',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
