import { z } from 'zod';
import { route } from '@/server/http';
import { checkSignature, readEventImage } from '@/server/media/photos';

export const dynamic = 'force-dynamic';

const notFound = () => new Response('Not found', { status: 404 });

/**
 * D230: serves an event's picture through a short-lived signed link (event cards and pages
 * carry the links). Expired or forged links get 403; unknown pictures, or pictures of events
 * nobody can see (drafts, denied, removed), 404.
 */
export const GET = route<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return notFound();
  const q = new URL(req.url).searchParams;
  if (!checkSignature(id, q.get('exp'), q.get('sig'), new Date(), 'event-image')) {
    return new Response('Link expired', { status: 403 });
  }
  const pic = await readEventImage(id);
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
