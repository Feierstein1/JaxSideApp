import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { getConfig } from '@/server/config';
import { ApiError, route } from '@/server/http';
import { uploadPhoto } from '@/server/media/photos';

/** Reads the request body but stops as soon as it passes `max` bytes. */
async function readCapped(req: Request, max: number): Promise<Buffer> {
  const declared = Number(req.headers.get('content-length') ?? 0);
  const tooBig = () =>
    new ApiError(413, 'TOO_LARGE', `Photos can be up to ${max / 1024 / 1024} MB.`);
  if (declared > max) throw tooBig();
  if (!req.body) throw new ApiError(400, 'VALIDATION_ERROR', 'Choose a photo');
  const chunks: Uint8Array[] = [];
  let size = 0;
  const reader = req.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > max) {
      await reader.cancel();
      throw tooBig();
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

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
