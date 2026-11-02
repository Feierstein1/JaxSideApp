import { readAdMedia } from '@/server/ad-media';
import { requireBusiness } from '@/server/auth';
import { jsonError, route } from '@/server/http';

type Ctx = { params: Promise<{ mediaId: string }> };

/** B3.2: an ad picture, for members of the business that uploaded it (preview, editor). */
export const GET = route<Ctx>(async (req, ctx) => {
  const { account } = await requireBusiness(req);
  const media = await readAdMedia(account, (await ctx.params).mediaId);
  if (!media) return jsonError(404, 'NOT_FOUND', 'Not found.');
  return new Response(new Uint8Array(media.body), {
    headers: {
      'Content-Type': media.mimeType,
      'Cache-Control': 'private, max-age=600',
      'X-Content-Type-Options': 'nosniff',
    },
  });
});
