import type {
  ReportReason,
  ScreeningAction,
  ScreeningCategory,
  ScreeningMatch,
} from '@/generated/prisma/client';
import { db } from '../db';
import { ApiError } from '../http';

/**
 * P5.4 text screening (§11.2, D56). Admin-configured rules (`ScreeningRule`) are matched
 * against a normalized form of the text, so common disguises still match:
 * look-alike letters (Cyrillic "а"), accents, leetspeak ("k1ll"), stretched letters
 * ("kiiill"), and spacing or dots between letters ("k i l l", "k.i.l.l").
 *
 * Outcomes, strongest wins: BLOCK (refused) > HOLD (saved, hidden until a moderator
 * reviews it) > WARN (ask "post anyway?") > allow. Plain profanity has no rules by
 * default, so it's allowed. Screening never punishes anyone by itself (§11.2).
 */

export interface Rule {
  id: string;
  term: string;
  match: ScreeningMatch;
  action: ScreeningAction;
  category: ScreeningCategory;
  message: string | null;
}

// ───────────────────────────── Normalization ─────────────────────────────

/** Common look-alikes from other alphabets (homoglyphs). */
const HOMOGLYPHS: Record<string, string> = {
  а: 'a',
  в: 'b',
  е: 'e',
  ё: 'e',
  к: 'k',
  м: 'm',
  н: 'h',
  о: 'o',
  р: 'p',
  с: 'c',
  т: 't',
  у: 'y',
  х: 'x',
  і: 'i',
  ї: 'i',
  ј: 'j',
  ѕ: 's',
  ԁ: 'd',
  ӏ: 'l',
  ɡ: 'g',
  ο: 'o',
  α: 'a',
  β: 'b',
  ε: 'e',
  ι: 'i',
  κ: 'k',
  ν: 'v',
  ρ: 'p',
  τ: 't',
  υ: 'u',
  χ: 'x',
  ω: 'w',
};

/** Leetspeak. `1`, `|` and `!` stand for "i" or "l", so both readings are checked. */
const LEET: Record<string, string> = {
  '0': 'o',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '6': 'g',
  '7': 't',
  '8': 'b',
  '9': 'g',
  '@': 'a',
  $: 's',
  '+': 't',
  '€': 'e',
  '£': 'l',
};
const I_OR_L = new Set(['1', '|', '!']);

function baseFold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/\p{M}+/gu, '') // accents
    .toLowerCase()
    .replace(/\p{Cf}/gu, '') // zero-width and other invisible format characters
    .replace(/['’`]/g, '') // "i'm" → "im"
    .replace(/./gu, (c) => HOMOGLYPHS[c] ?? c);
}

/** Words of letters only, with leet decoded. `oneAs` picks how `1 | !` are read. */
function words(folded: string, oneAs: 'i' | 'l'): string[] {
  const out: string[] = [];
  for (const raw of folded.split(/\s+/)) {
    // Trailing "!" or "?" is punctuation, not a letter ("you!").
    const token = raw.replace(/[!?.,;:]+$/, '');
    const mapped = [...token]
      .map((c) => (I_OR_L.has(c) ? oneAs : (LEET[c] ?? c)))
      .join('')
      .replace(/[^a-z]+/g, ' ')
      .trim();
    if (mapped) out.push(...mapped.split(' '));
  }
  // "k i l l" → "kill": join runs of 3+ single letters.
  const joined: string[] = [];
  let run = '';
  for (const w of out) {
    if (w.length === 1) {
      run += w;
      continue;
    }
    if (run) joined.push(...(run.length >= 3 ? [run] : [...run]));
    run = '';
    joined.push(w);
  }
  if (run) joined.push(...(run.length >= 3 ? [run] : [...run]));
  // "kiiill" → "kil" (rule terms get the same treatment, so "kill" → "kil").
  return joined.map((w) => w.replace(/(.)\1+/g, '$1'));
}

/** The forms a text is checked in. Exported for tests. */
export function normalizedForms(text: string): { words: string[]; squashed: string[] } {
  const folded = baseFold(text);
  const variants = [words(folded, 'i'), words(folded, 'l')];
  return {
    words: variants.map((w) => ` ${w.join(' ')} `),
    squashed: variants.map((w) => w.join('')),
  };
}

export function normalizeTerm(term: string): string {
  return words(baseFold(term), 'i').join(' ');
}

function matches(rule: Rule, forms: ReturnType<typeof normalizedForms>): boolean {
  const t = normalizeTerm(rule.term);
  if (!t) return false;
  return rule.match === 'WORD'
    ? forms.words.some((f) => f.includes(` ${t} `))
    : forms.squashed.some((f) => f.includes(t.replace(/ /g, '')));
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

// ───────────────────────────── Decisions ─────────────────────────────

const DEFAULT_MESSAGE: Record<ScreeningCategory, string> = {
  SLUR: 'This looks like it includes a slur. JaxSide doesn’t allow hate toward people for who they are.',
  THREAT:
    'This looks like a threat. Threats of violence aren’t allowed. If someone is in danger, call 911.',
  SEXUAL: 'Sexual content isn’t allowed on JaxSide.',
  HARASSMENT:
    'This may come across as harassment. Please keep it about ideas, not attacking people.',
  DOXXING: 'This looks like it may share someone’s private information.',
  SPAM: 'This looks like spam.',
  OTHER: 'This may break the Community Guidelines.',
};

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
  target: { generalPostId: string } | { businessPostId: string } | { commentId: string },
) {
  await db.report.create({ data: { ...target, reason: hold.reason, details: hold.details } });
}

/** Why content is held: becomes the automatic report (screening or spam checks). */
export interface Hold {
  reason: ReportReason;
  details: string;
}

export function holdFor(rule: Rule): Hold {
  return {
    reason: REPORT_REASON_FOR[rule.category],
    details: `Held by automatic screening (${rule.category.toLowerCase()} rule ${rule.id}).`,
  };
}
