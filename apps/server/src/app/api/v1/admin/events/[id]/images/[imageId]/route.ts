import { NextResponse } from 'next/server';
import { z } from 'zod';
import { audit } from '@/server/admin/audit';
import { requireAdmin } from '@/server/admin/auth';
import { adminRateLimit } from '@/server/admin/users';
import { removeEventImage } from '@/server/events/save';
import { db } from '@/server/db';
import { ApiError, route } from '@/server/http';
import { objectStore } from '@/server/media/store';

type Ctx = { params: Promise<{ id: string; imageId: string }> };

/** D230: take a picture off an event (deleted from storage too). Audited. */
export const DELETE = route<Ctx>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const { id, imageId } = await ctx.params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(imageId).success) {
    throw new ApiError(404, 'NOT_FOUND', 'Not found');
  }
  await adminRateLimit(admin.id);
  await removeEventImage(id, imageId);
  await audit(admin.id, 'EVENT_IMAGE_REMOVED', { type: 'event', id }, { imageId });
  return NextResponse.json({ ok: true });
});

/** D230: an event's picture for the admin pages (any status, so waiting events can be checked). */
export const GET = route<Ctx>(async (req, ctx) => {
  await requireAdmin(req);
  const { id, imageId } = await ctx.params;
  if (!z.uuid().safeParse(id).success || !z.uuid().safeParse(imageId).success) {
    return new Response('Not found', { status: 404 });
  }
  const img = await db.eventImage.findFirst({ where: { id: imageId, eventId: id } });
  const body = img ? await objectStore().get(img.storageKey) : null;
  if (!img || !body) return new Response('Not found', { status: 404 });
  return new Response(new Uint8Array(body), {
    headers: {
      'Content-Type': img.mimeType,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
