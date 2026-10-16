import { z } from 'zod';
import { route } from '@/server/http';
import { checkSignature, readPhoto } from '@/server/media/photos';

export const dynamic = 'force-dynamic';

const notFound = () => new Response('Not found', { status: 404 });

/**
 * P6.4: serves a photo through a short-lived signed link (posts and profiles carry the
 * links; the storage bucket itself is private). Expired or forged links get 403;
 * removed, unattached-and-stale, or unknown photos 404.
 */
export const GET = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const q = new URL(req.url).searchParams;
  if (!checkSignature(id, q.get('exp'), q.get('sig'))) {
    return new Response('Link expired', { status: 403 });
  }
  const photo = await readPhoto(id);
  if (!photo) return notFound();
  return new Response(new Uint8Array(photo.body), {
    headers: {
      'Content-Type': photo.mimeType,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      'Content-Disposition': 'inline',
    },
  });
});
