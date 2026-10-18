import { NextResponse } from 'next/server';
import { requireUser } from '@/server/auth/require-actor';
import { getConfig } from '@/server/config';
import { ApiError, route } from '@/server/http';
import { readCapped } from '@/server/media/read-capped';
import { uploadVoice } from '@/server/media/voice';

/**
 * D75: upload one voice clip (the .m4a bytes as the body). Confirmed users only; shares
 * the daily upload limit with photos; checked before storing. Attach it to a post by ID.
 */
export const POST = route(async (req) => {
  const { user } = await requireUser(req, { requireVerifiedEmail: true });
  const type = req.headers.get('content-type') ?? '';
  if (!type.startsWith('audio/') && type !== 'application/octet-stream') {
    throw new ApiError(
      415,
      'UNSUPPORTED_MEDIA_TYPE',
      'Send the recording itself as the request body',
    );
  }
  const max = (await getConfig('voice.maxUploadMB')) * 1024 * 1024;
  const body = await readCapped(req, max, 'Voice clips');
  return NextResponse.json(await uploadVoice(user, body), { status: 201 });
});
