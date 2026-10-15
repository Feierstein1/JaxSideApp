import { z } from 'zod';
import { ApiError } from '../http';

export type PlaceRouteCtx = { params: Promise<{ id: string }> };

/** The place ID from the URL; anything that isn't a UUID is a 404. */
export async function placeIdFrom(ctx: PlaceRouteCtx): Promise<string> {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new ApiError(404, 'NOT_FOUND', 'Place not found');
  return id;
}
