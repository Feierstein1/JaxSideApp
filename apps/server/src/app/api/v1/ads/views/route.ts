import { adViews } from '@/server/ads/handlers';
import { route } from '@/server/http';

/** D206: a batch of ad views (counted once per person per ad per day). */
export const POST = route(adViews);
