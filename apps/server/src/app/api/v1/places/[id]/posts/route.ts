import { route } from '@/server/http';
import { createBusiness, type IdCtx } from '@/server/discussions/handlers';

/** P3.2: post in a place's room (within 0.3 mi, D19). */
export const POST = route<IdCtx>(createBusiness);
