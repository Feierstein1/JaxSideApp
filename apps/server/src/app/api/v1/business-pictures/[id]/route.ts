import { z } from 'zod';
import { route } from '@/server/http';
import { checkSignature, readBusinessPicture } from '@/server/media/photos';

export const dynamic = 'force-dynamic';

const notFound = () => new Response('Not found', { status: 404 });

/**
 * D189: serves a business login's profile picture through a short-lived signed link
 * ("The Owner" posts and replies carry the links). Expired or forged links get 403;
 * removed, replaced or unknown pictures 404.
 */
export const GET = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const q = new URL(req.url).searchParams;
  if (!checkSignature(id, q.get('exp'), q.get('sig'), new Date(), 'business-picture')) {
    return new Response('Link expired', { status: 403 });
  }
  const pic = await readBusinessPicture(id);
  if (!pic) return notFound();
  return new Response(new Uint8Array(pic.body), {
    headers: {
      'Content-Type': pic.mimeType,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  });
});
