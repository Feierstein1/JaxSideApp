import { route } from '@/server/http';
import { createGeneral } from '@/server/discussions/handlers';

/** P3.1: create a general post. */
export const POST = route(createGeneral);
