import type {
  ReportReason,
  ScreeningAction,
  ScreeningCategory,
  ScreeningMatch,
} from '@/generated/prisma/client';
import { SCREENING_MESSAGES, normalizedForms, ruleMatches as matches } from '@jax/shared';
import { db } from '../db';
import { ApiError } from '../http';

/**
 * P5.4 text screening (§11.2, D56). Admin-configured rules (`ScreeningRule`) are matched
 * against a normalized form of the text (the matching itself is in `@jax/shared`, so the
 * business website screens the same way, D169).
 *
 * Outcomes, strongest wins: BLOCK (refused) > HOLD (saved, hidden until a moderator
 * reviews it) > WARN (ask "post anyway?") > allow. Plain profanity has no rules by
 * default, so it's allowed. Screening never punishes anyone by itself (§11.2).
 */

// Re-exported for existing callers and tests.
export { normalizedForms, normalizeTerm } from '@jax/shared';

export interface Rule {
  id: string;
  term: string;
  match: ScreeningMatch;
  action: ScreeningAction;
  category: ScreeningCategory;
  message: string | null;
}

// ───────────────────────────── Rules ─────────────────────────────

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

/** After an admin edits rules, and in tests. */
export function invalidateScreeningCache(): void {
  cache = undefined;
}

const STRENGTH: Record<ScreeningAction, number> = { WARN: 1, HOLD: 2, BLOCK: 3 };

/** The strongest rule the text matches, or null. */
export async function strongestMatch(text: string): Promise<Rule | null> {
  const forms = normalizedForms(text);
  let best: Rule | null = null;
  for (const r of await loadRules()) {
    if ((!best || STRENGTH[r.action] > STRENGTH[best.action]) && matches(r, forms)) best = r;
  }
  return best;
}

/**
 * P15.9: every rule the text matches, strongest first (the admin Screening page's test box).
 * `includeDisabled` also checks rules that are turned off.
 */
export async function allMatches(text: string, includeDisabled = false): Promise<Rule[]> {
  const forms = normalizedForms(text);
  const rules = includeDisabled
    ? await db.screeningRule.findMany({
        select: { id: true, term: true, match: true, action: true, category: true, message: true },
      })
    : await loadRules();
  return rules
    .filter((r) => matches(r, forms))
    .sort((a, b) => STRENGTH[b.action] - STRENGTH[a.action]);
}

// ───────────────────────────── Decisions ─────────────────────────────

const DEFAULT_MESSAGE: Record<ScreeningCategory, string> = SCREENING_MESSAGES;

export const messageFor = (r: Rule) => r.message || DEFAULT_MESSAGE[r.category];

/**
 * Where the text is going. New posts and comments can be held for review; edits, bios
 * and usernames can't be held (they'd hide or change something already public), so a
 * HOLD rule refuses them instead (D56). Usernames refuse on any match.
 */
export type ScreenTarget = 'new-content' | 'edit' | 'bio' | 'username';

export type ScreenResult = { held: false } | { held: true; rule: Rule };

export async function screenText(
  text: string,
  target: ScreenTarget,
  opts: { confirmWarning?: boolean } = {},
): Promise<ScreenResult> {
  const rule = await strongestMatch(text);
  if (!rule) return { held: false };
  const refuse = () =>
    new ApiError(422, 'CONTENT_BLOCKED', messageFor(rule), { category: rule.category });

  if (target === 'username') {
    throw new ApiError(422, 'CONTENT_BLOCKED', 'That username isn’t allowed. Please pick another.');
  }
  if (rule.action === 'BLOCK') throw refuse();
  if (rule.action === 'HOLD') {
    if (target !== 'new-content') throw refuse();
    return { held: true, rule };
  }
  // WARN: explain, and let the person decide (§11.2 "explanatory prompt").
  if (!opts.confirmWarning) {
    throw new ApiError(409, 'CONTENT_WARNING', messageFor(rule), {
      category: rule.category,
      canConfirm: true,
    });
  }
  return { held: false };
}

/** Screening category → report reason, for the automatic report on held content. */
const REPORT_REASON_FOR: Record<ScreeningCategory, ReportReason> = {
  SLUR: 'HATE',
  THREAT: 'THREAT',
  SEXUAL: 'SEXUAL_CONTENT',
  HARASSMENT: 'HARASSMENT',
  DOXXING: 'DOXXING',
  SPAM: 'SPAM',
  OTHER: 'OTHER',
};

/**
 * Puts held content in the moderation queue (P5.14): a report with no reporter, so it
 * never appears in anyone's "My reports".
 */
export async function holdReport(
  hold: Hold,
  target:
    | { generalPostId: string }
    | { businessPostId: string }
    | { commentId: string }
    | { cityTopicId: string }, // D142
) {
  await db.report.create({ data: { ...target, reason: hold.reason, details: hold.details } });
}

/** Why content is held: becomes the automatic report (screening or spam checks). */
export interface Hold {
  reason: ReportReason;
  details: string;
  /** D227: what the author is told instead of the usual "a moderator will review this". */
  message?: string;
}

export function holdFor(rule: Rule): Hold {
  return {
    reason: REPORT_REASON_FOR[rule.category],
    details: `Held by automatic screening (${rule.category.toLowerCase()} rule ${rule.id}).`,
  };
}
