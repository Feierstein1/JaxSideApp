import { z } from 'zod';
import { CASE_TYPES } from '@jax/shared';
import { ApiError } from '../http';
import type { CaseRef } from './queue';

const NOT_FOUND = () => new ApiError(404, 'NOT_FOUND', 'Not found');

export type IdParams = { params: Promise<{ id: string }> };
export type CaseParams = { params: Promise<{ type: string; id: string }> };

export async function uuidParam(ctx: IdParams): Promise<string> {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw NOT_FOUND();
  return id;
}

export async function caseParam(ctx: CaseParams): Promise<CaseRef> {
  const { type, id } = await ctx.params;
  if (!(CASE_TYPES as readonly string[]).includes(type) || !z.uuid().safeParse(id).success) {
    throw NOT_FOUND();
  }
  return { type: type as CaseRef['type'], id };
}
