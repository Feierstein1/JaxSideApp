import { route } from '@/server/http';
import { feed } from '@/server/discussions/handlers';

/** P3.1: the general feed around the reader's verified location. */
export const POST = route(feed);
