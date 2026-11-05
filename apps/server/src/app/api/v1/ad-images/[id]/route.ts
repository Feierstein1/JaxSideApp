import { z } from 'zod';
import { route } from '@/server/http';
import { checkSignature, readAdImage } from '@/server/media/photos';

export const dynamic = 'force-dynamic';

const notFound = () => new Response('Not found', { status: 404 });

/**
 * D206: serves an ad's image or GIF through a short-lived signed link
 * (ad cards carry the links). Expired or forged links get 403;
 * removed, unknown, or not on an approved ad: 404.
 */
export const GET = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const q = new URL(req.url).searchParams;
  if (!checkSignature(id, q.get('exp'), q.get('sig'), new Date(), 'ad-image')) {
    return new Response('Link expired', { status: 403 });
  }
  const pic = await readAdImage(id);
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
