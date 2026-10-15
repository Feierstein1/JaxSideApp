import { route } from '@/server/http';
import { postDelete, postDetail, postEdit, type IdCtx } from '@/server/discussions/handlers';

/** P3.1 / P3.8: read a general post with comments (POST: carries a location), edit, delete. */
export const POST = route<IdCtx>(postDetail('general'));
export const PATCH = route<IdCtx>(postEdit('general'));
export const DELETE = route<IdCtx>(postDelete('general'));
