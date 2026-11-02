import { SCREENING_MESSAGES, normalizedForms, ruleMatches } from '@jax/shared';
import type { ScreeningAction, ScreeningRule } from '@/generated/prisma/client';
import { db } from './db';
import { ApiError } from './http';

/**
 * Text screening for anything a business puts in public (staff names now, posts and
 * replies in B1.6, ads later). Same admin rules as the app (`ScreeningRule`, shared
 * database) and the same matching (`@jax/shared`), so moderation is identical (D172).
 */

type Rule = Pick<ScreeningRule, 'id' | 'term' | 'match' | 'action' | 'category' | 'message'>;

const CACHE_TTL_MS = 30_000;
let cache: { rules: Rule[]; loadedAt: number } | undefined;

async function loadRules(): Promise<Rule[]> {
  if (cache && Date.now() - cache.loadedAt < CACHE_TTL_MS) return cache.rules;
  const rules = await db.screeningRule.findMany({
    where: { enabled: true },
    select: { id: true, term: true, match: true, action: true, category: true, message: true },
  });
  cache = { rules, loadedAt: Date.now() };
  return rules;
}

/** In tests, after changing rules. */
export function invalidateScreeningCache(): void {
  cache = undefined;
}

const STRENGTH: Record<ScreeningAction, number> = { WARN: 1, HOLD: 2, BLOCK: 3 };

async function strongestMatch(text: string): Promise<Rule | null> {
  const forms = normalizedForms(text);
  let best: Rule | null = null;
  for (const r of await loadRules()) {
    if ((!best || STRENGTH[r.action] > STRENGTH[best.action]) && ruleMatches(r, forms)) best = r;
  }
  return best;
}

export type ScreenResult = { held: false } | { held: true; rule: Rule };

/**
 * `name` (a staff name shown on posts): any match refuses it. `new-content` (a post or
 * reply): BLOCK refuses, HOLD saves it hidden for a moderator, WARN asks "post anyway?".
 */
export async function screenText(
  text: string,
  target: 'name' | 'new-content',
  opts: { confirmWarning?: boolean } = {},
): Promise<ScreenResult> {
  const rule = await strongestMatch(text);
  if (!rule) return { held: false };
  const message = rule.message || SCREENING_MESSAGES[rule.category];
  if (target === 'name') {
    throw new ApiError(422, 'CONTENT_BLOCKED', 'That name isn’t allowed. Please use another.');
  }
  if (rule.action === 'BLOCK') {
    throw new ApiError(422, 'CONTENT_BLOCKED', message, { category: rule.category });
  }
  if (rule.action === 'HOLD') return { held: true, rule };
  if (!opts.confirmWarning) {
    throw new ApiError(409, 'CONTENT_WARNING', message, {
      category: rule.category,
      canConfirm: true,
    });
  }
  return { held: false };
}
