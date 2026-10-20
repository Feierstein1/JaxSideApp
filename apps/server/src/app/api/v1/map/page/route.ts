import { route } from '@/server/http';
import { mapPage } from '@/server/map/page';
import { checkMapSignature, signedMapUrl } from '@/server/map/tiles';

export const dynamic = 'force-dynamic';

/** D99: the map page for the app's WebView (signed link from GET /map). */
export const GET = route(async (req) => {
  const q = new URL(req.url).searchParams;
  if (!checkMapSignature('page', q.get('exp'), q.get('sig'))) {
    return new Response('Link expired', { status: 403 });
  }
  const { html, csp } = mapPage(signedMapUrl('tiles'));
  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': csp,
      'Cache-Control': 'private, no-store',
    },
  });
});
