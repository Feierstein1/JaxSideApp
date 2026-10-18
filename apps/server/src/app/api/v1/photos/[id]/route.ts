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
  const headers = {
    'Content-Type': photo.mimeType,
    'Cache-Control': 'private, max-age=3600',
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition': 'inline',
    'Accept-Ranges': 'bytes',
  };
  // D75: audio players (iPhone especially) fetch voice clips in byte ranges.
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.get('range') ?? '');
  const size = photo.body.length;
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    return new Response(new Uint8Array(photo.body.subarray(start, end + 1)), {
      status: 206,
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}` },
    });
  }
  return new Response(new Uint8Array(photo.body), { headers });
});
