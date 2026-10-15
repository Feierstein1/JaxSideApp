import { route } from '@/server/http';
import { placePosts, type IdCtx } from '@/server/discussions/handlers';

/** P3.2: a place's room, newest first (within 0.3 mi, D19). */
export const POST = route<IdCtx>(placePosts);
