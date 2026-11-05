import type { z } from 'zod';
import type { screeningRuleSchema, screeningRuleUpdateSchema } from '@jax/shared';
import type { Prisma, ScreeningAction, ScreeningCategory } from '@/generated/prisma/client';
import { db } from '../db';
import { ApiError } from '../http';
import { allMatches, invalidateScreeningCache, normalizeTerm } from '../moderation/screening';
import { pageWindow, toPage } from './paging';

/**
 * P15.9: the admin Screening page. Rules are words or phrases checked in posts, comments,
 * topics, bios and usernames (moderation/screening.ts): BLOCK refuses, HOLD hides the text
 * for a moderator, WARN asks "Post anyway?". Changes apply within seconds (the cache is
 * cleared here; other server processes refresh within 30 s).
 */

/** Screening terms (filtered by category, action or "turned off"), 20 a page (D210). */
export async function listRules(
  opts: { category?: string; action?: string; off?: boolean; page?: number } = {},
) {
  const page = opts.page ?? 1;
  const where: Prisma.ScreeningRuleWhereInput = {
    ...(opts.category ? { category: opts.category as ScreeningCategory } : {}),
    ...(opts.action ? { action: opts.action as ScreeningAction } : {}),
    ...(opts.off ? { enabled: false } : {}),
  };
  const [rows, total, all] = await Promise.all([
    db.screeningRule.findMany({
      where,
      orderBy: [{ enabled: 'desc' }, { category: 'asc' }, { term: 'asc' }, { id: 'asc' }],
      ...pageWindow(page),
    }),
    db.screeningRule.count({ where }),
    db.screeningRule.count(),
  ]);
  const list = rows.map((r) => ({
    id: r.id,
    term: r.term,
    match: r.match,
    action: r.action,
    category: r.category,
    message: r.message,
    enabled: r.enabled,
    updatedAt: r.updatedAt.toISOString(),
  }));
  return { ...toPage(list, total, page), all };
}

export async function createRule(input: z.output<typeof screeningRuleSchema>) {
  if (!normalizeTerm(input.term)) {
    throw new ApiError(400, 'VALIDATION_ERROR', 'That term has no letters or numbers to match.');
  }
  const existing = await db.screeningRule.findUnique({
    where: { term_match: { term: input.term, match: input.match } },
  });
  if (existing) throw new ApiError(409, 'ALREADY_EXISTS', 'That term is already on the list.');
  const r = await db.screeningRule.create({
    data: {
      term: input.term,
      match: input.match,
      action: input.action,
      category: input.category,
      message: input.message ?? null,
    },
  });
  invalidateScreeningCache();
  return r.id;
}

export async function updateRule(id: string, input: z.output<typeof screeningRuleUpdateSchema>) {
  const r = await db.screeningRule.findUnique({ where: { id }, select: { id: true } });
  if (!r) throw new ApiError(404, 'NOT_FOUND', 'Rule not found');
  await db.screeningRule.update({ where: { id }, data: input });
  invalidateScreeningCache();
}

/** What would happen to this text, and which terms it matches (on and off). */
export async function testText(text: string) {
  const all = await allMatches(text, true);
  const enabled = new Set((await allMatches(text)).map((r) => r.id));
  const strongest = all.find((r) => enabled.has(r.id));
  return {
    outcome: !strongest
      ? ('allowed' as const)
      : strongest.action === 'BLOCK'
        ? ('blocked' as const)
        : strongest.action === 'HOLD'
          ? ('held' as const)
          : ('warned' as const),
    matches: all.map((r) => ({
      id: r.id,
      term: r.term,
      action: r.action,
      category: r.category,
      enabled: enabled.has(r.id),
    })),
  };
}
