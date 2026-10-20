import { route } from '@/server/http';
import { checkMapSignature, readTilesRange } from '@/server/map/tiles';

export const dynamic = 'force-dynamic';

/**
 * D99: the Duval map tiles (one PMTiles file), read in byte ranges by the map page. Signed
 * links only; the file never leaves in one piece.
 */
export const GET = route(async (req) => {
  const q = new URL(req.url).searchParams;
  if (!checkMapSignature('tiles', q.get('exp'), q.get('sig'))) {
    return new Response('Link expired', { status: 403 });
  }
  let r;
  try {
    r = await readTilesRange(req.headers.get('range'));
  } catch {
    return new Response('Map not available', { status: 404 });
  }
  const common = { 'Accept-Ranges': 'bytes', ETag: r.etag };
  if (r.status === 416) {
    return new Response(null, {
      status: 416,
      headers: { ...common, 'Content-Range': `bytes */${r.size}` },
    });
  }
  if (r.status === 400) {
    return new Response('Use a Range request', { status: 400, headers: common });
  }
  return new Response(new Uint8Array(r.body), {
    status: 206,
    headers: {
      ...common,
      'Content-Type': 'application/octet-stream',
      'Content-Range': `bytes ${r.start}-${r.end}/${r.size}`,
      'Cache-Control': 'private, max-age=86400',
    },
  });
});
