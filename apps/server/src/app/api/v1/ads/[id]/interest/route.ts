import { adInterest } from '@/server/ads/handlers';
import type { IdCtx } from '@/server/discussions/handlers';
import { route } from '@/server/http';

/** D206: Interested / Not interested on an ad (accounts only). */
export const POST = route<IdCtx>(adInterest);
