import { route } from '@/server/http';
import { iconFont } from '@/server/map/icons';

/**
 * D113: the icon font the map page draws its markers with (Ionicons, MIT). Public, like any
 * web font; the phone keeps it for a week.
 */
export const GET = route(async () => {
  return new Response(new Uint8Array(await iconFont()), {
    headers: {
      'Content-Type': 'font/ttf',
      'Cache-Control': 'public, max-age=604800, immutable',
    },
  });
});
