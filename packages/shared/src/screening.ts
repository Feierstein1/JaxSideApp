/**
 * P5.4 text screening (§11.2, D56): the pure matching half, shared by the app server and
 * the business website (D169) so both screen text the same way. Admin-configured rules
 * (`ScreeningRule`, in the shared database) are matched against a normalized form of the
 * text, so common disguises still match: look-alike letters (Cyrillic "а"), accents,
 * leetspeak ("k1ll"), stretched letters ("kiiill"), and spacing or dots between letters.
 * Loading the rules and deciding what happens stays with each server.
 */

export type ScreeningMatchKind = 'WORD' | 'CONTAINS';

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
function words(folded: string, oneAs: 'i' | 'l', splitLead = false): string[] {
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
  // "k i l l" → "kill": join runs of 3+ single letters. With `splitLead`, a run that starts
  // with the words "a" or "i" keeps that word apart ("a k i l l" → "a kill"), since those are
  // real one-letter words; the caller also checks the plain join.
  const joined: string[] = [];
  let run = '';
  const flush = () => {
    if (!run) return;
    if (splitLead && run.length >= 4 && (run[0] === 'a' || run[0] === 'i')) {
      joined.push(run[0]!, run.slice(1));
    } else {
      joined.push(...(run.length >= 3 ? [run] : [...run]));
    }
    run = '';
  };
  for (const w of out) {
    if (w.length === 1) {
      run += w;
      continue;
    }
    flush();
    joined.push(w);
  }
  flush();
  // "kiiill" → "kil" (rule terms get the same treatment, so "kill" → "kil").
  return joined.map((w) => w.replace(/(.)\1+/g, '$1'));
}

/** The forms a text is checked in. Exported for tests. */
export function normalizedForms(text: string): { words: string[]; squashed: string[] } {
  const folded = baseFold(text);
  const variants = [
    words(folded, 'i'),
    words(folded, 'l'),
    words(folded, 'i', true),
    words(folded, 'l', true),
  ];
  return {
    words: variants.map((w) => ` ${w.join(' ')} `),
    squashed: variants.map((w) => w.join('')),
  };
}

export function normalizeTerm(term: string): string {
  return words(baseFold(term), 'i').join(' ');
}

/** Whether one rule matches the text's forms (from `normalizedForms`). */
export function ruleMatches(
  rule: { term: string; match: ScreeningMatchKind },
  forms: ReturnType<typeof normalizedForms>,
): boolean {
  const t = normalizeTerm(rule.term);
  if (!t) return false;
  return rule.match === 'WORD'
    ? forms.words.some((f) => f.includes(` ${t} `))
    : forms.squashed.some((f) => f.includes(t.replace(/ /g, '')));
}

export type ScreeningCategoryKind =
  'SLUR' | 'THREAT' | 'SEXUAL' | 'HARASSMENT' | 'DOXXING' | 'SPAM' | 'OTHER';

/** What a person is told when a rule without its own message matches. */
export const SCREENING_MESSAGES: Record<ScreeningCategoryKind, string> = {
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
