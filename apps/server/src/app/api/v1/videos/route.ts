import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { getConfig } from '@/server/config';
import { ApiError, route } from '@/server/http';
import { readCapped } from '@/server/media/read-capped';
import { uploadVideo } from '@/server/media/video';

/**
 * D102: upload one video (the MP4/MOV bytes as the body, up to 30 s and 25 MB). Confirmed
 * users only; shares the daily upload limit; checked and cleaned before storing. Attach it
 * to a post by ID.
 */
export const POST = route(async (req) => {
  const { user } = await requireUser(req, { requireVerifiedEmail: true });
  const type = req.headers.get('content-type') ?? '';
  if (!type.startsWith('video/') && type !== 'application/octet-stream') {
    throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE', 'Send the video itself as the request body');
  }
  const max = (await getConfig('video.maxUploadMB')) * 1024 * 1024;
  const body = await readCapped(req, max, 'Videos');
  return NextResponse.json(await uploadVideo(user, body), { status: 201 });
});
