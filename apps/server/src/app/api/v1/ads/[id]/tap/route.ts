import { adTap } from '@/server/ads/handlers';
import type { IdCtx } from '@/server/discussions/handlers';
import { route } from '@/server/http';

/** D216: a tap on an ad's link button (counted once per person per ad per day). */
export const POST = route<IdCtx>(adTap);
