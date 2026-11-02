import { NextResponse } from 'next/server';
import { z } from 'zod';
import { uploadAdMedia, MAX_UPLOAD_BYTES } from '@/server/ad-media';
import { requireBusiness } from '@/server/auth';
import { ApiError, route } from '@/server/http';

type Ctx = { params: Promise<{ placeId: string }> };
const templateSchema = z.enum(['BANNER', 'POST', 'FEATURE']);

/**
 * B3.2: upload an ad picture or GIF: the raw file bytes as the body, `?template=` for the
 * shape it must fit. Checked and re-encoded on the server (never trusted from the browser).
 */
export const POST = route<Ctx>(async (req, ctx) => {
  const { account } = await requireBusiness(req);
  const template = templateSchema.safeParse(new URL(req.url).searchParams.get('template'));
  if (!template.success) throw new ApiError(400, 'VALIDATION', 'Choose a template first.');
  const declared = Number(req.headers.get('content-length') ?? 0);
  if (declared > MAX_UPLOAD_BYTES) {
    throw new ApiError(413, 'TOO_LARGE', 'Pictures can be up to 12 MB before they’re resized.');
  }
  const body = Buffer.from(await req.arrayBuffer());
  const { placeId } = await ctx.params;
  return NextResponse.json(await uploadAdMedia(account, placeId, template.data, body), {
    status: 201,
  });
});
