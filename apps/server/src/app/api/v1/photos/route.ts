import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { getConfig } from '@/server/config';
import { ApiError, route } from '@/server/http';
import { uploadPhoto } from '@/server/media/photos';
import { readCapped } from '@/server/media/read-capped';

/**
 * P6.1/P6.2: upload one photo (the raw image bytes as the body). Registered users with
 * a confirmed email only; rate-limited; the server checks and re-encodes it before
 * anything is stored (D65). Returns an ID to attach to a post or set as your avatar.
 */
export const POST = route(async (req) => {
  const { user } = await requireUser(req, { requireVerifiedEmail: true });
  const type = req.headers.get('content-type') ?? '';
  if (!type.startsWith('image/') && type !== 'application/octet-stream') {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the photo itself as the request body');
  }
  const max = (await getConfig('photos.maxUploadMB')) * 1024 * 1024;
  const body = await readCapped(req, max);
  return NextResponse.json(await uploadPhoto(user, body), { status: 201 });
});
