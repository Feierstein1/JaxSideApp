import { route } from '@/server/http';
import { postVote, type IdCtx } from '@/server/discussions/handlers';

export const PUT = route<IdCtx>(postVote('business'));
