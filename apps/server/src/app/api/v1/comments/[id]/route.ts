import { route } from '@/server/http';
import { commentDelete, commentEdit, type IdCtx } from '@/server/discussions/handlers';

/** P3.8: authors edit or delete their own comments. */
export const PATCH = route<IdCtx>(commentEdit);
export const DELETE = route<IdCtx>(commentDelete);
