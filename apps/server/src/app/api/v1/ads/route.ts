import { adsForScreen } from '@/server/ads/handlers';
import { route } from '@/server/http';

/** D206 / B3.4: the ads to show on the screen the phone is on (guests too). */
export const POST = route(adsForScreen);
