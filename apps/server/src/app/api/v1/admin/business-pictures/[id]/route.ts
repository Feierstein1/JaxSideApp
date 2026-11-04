import { requireAdmin } from '@/server/admin/auth';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { db } from '@/server/db';
import { route } from '@/server/http';
import { objectStore } from '@/server/media/store';

export const dynamic = 'force-dynamic';

/** D189: moderators can see a business login's picture, including after it's removed. */
export const GET = route<IdParams>(async (req, ctx) => {
  await requireAdmin(req);
  const m = await db.adMedia.findUnique({ where: { id: await uuidParam(ctx) } });
  const body = m?.storageKey ? await objectStore().get(m.storageKey) : null;
  if (!body) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': m!.mimeType ?? 'image/jpeg',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
