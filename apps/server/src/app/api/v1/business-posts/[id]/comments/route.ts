import { route } from '@/server/http';
import { commentCreate, type IdCtx } from '@/server/discussions/handlers';

export const POST = route<IdCtx>(commentCreate('business'));
