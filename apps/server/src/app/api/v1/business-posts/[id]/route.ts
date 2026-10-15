import { route } from '@/server/http';
import { postDelete, postDetail, postEdit, type IdCtx } from '@/server/discussions/handlers';

/** P3.2 / P3.8: a business-room post (readable within 0.3 mi of its place, D19). */
export const POST = route<IdCtx>(postDetail('business'));
export const PATCH = route<IdCtx>(postEdit('business'));
export const DELETE = route<IdCtx>(postDelete('business'));
