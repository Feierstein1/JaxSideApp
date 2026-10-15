import { route } from '@/server/http';
import { commentVote, type IdCtx } from '@/server/discussions/handlers';

export const PUT = route<IdCtx>(commentVote);
