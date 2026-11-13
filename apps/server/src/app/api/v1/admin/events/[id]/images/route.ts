import { NextResponse } from 'next/server';
import { audit } from '@/server/admin/audit';
import { requireAdmin } from '@/server/admin/auth';
import { uuidParam, type IdParams } from '@/server/admin/params';
import { adminRateLimit } from '@/server/admin/users';
import { getConfig } from '@/server/config';
import { db } from '@/server/db';
import { addEventImage } from '@/server/events/save';
import { ApiError, route } from '@/server/http';
import { readCapped } from '@/server/media/read-capped';
import { signedEventImageUrl } from '@/server/media/photos';

/**
 * D230: add a picture to an event (the image bytes as the body). Cleaned like photos: real
 * type checked, re-encoded, all metadata dropped. At most 6 photos per event; D242: `?kind=flyer`
 * adds a flyer instead (at most 2, shown whole). Audited.
 */
export const POST = route<IdParams>(async (req, ctx) => {
  const { admin } = await requireAdmin(req);
  const id = await uuidParam(ctx);
  const type = req.headers.get('content-type') ?? '';
  if (!type.startsWith('image/') && type !== 'application/octet-stream') {
    throw new ApiError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'Send the picture itself as the request body',
    );
  }
  await adminRateLimit(admin.id);
  if (!(await db.event.count({ where: { id } }))) {
    throw new ApiError(404, 'NOT_FOUND', 'Event not found');
  }
  const body = await readCapped(req, (await getConfig('photos.maxUploadMB')) * 1024 * 1024);
  const kind = new URL(req.url).searchParams.get('kind') === 'flyer' ? 'flyer' : 'photo';
  const img = await addEventImage(id, body, kind);
  await audit(admin.id, 'EVENT_IMAGE_ADDED', { type: 'event', id }, { imageId: img.id, kind });
  return NextResponse.json({ id: img.id, url: signedEventImageUrl(img.id) }, { status: 201 });
});
