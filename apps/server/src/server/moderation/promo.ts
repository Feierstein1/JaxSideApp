/**
 * D227 (from D220): posts that read like an ad for the author's own business. Nobody can
 * stop someone advertising from a personal account, so this only deters: a post that looks
 * like an ad waits for a moderator, and its author is told the right place for it (JaxSide
 * for Business, where the first month is free). Recommending a place stays fine: a single
 * signal never holds a post; it takes `spam.promoHoldScore` of them (a strong one counts 2).
 */

interface Signal {
  re: RegExp;
  weight: number;
}

/** A US phone number, written the usual ways. */
export const PHONE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/;

const SIGNALS: Signal[] = [
  // Strong: these are asks, not opinions.
  {
    re: /\b(dm|message|text|call)\s+(me|us)\b.{0,30}\b(order|book|price|info|appointment)/i,
    weight: 2,
  },
  { re: /\b(use|enter|with)\s+(my\s+|our\s+|promo\s+|discount\s+)?code\b/i, weight: 2 },
  {
    re: /\b(link in (my |our )?bio|order (now|today|online)|book (now|today|online))\b/i,
    weight: 2,
  },
  // A web address spelled out to get around the link rule (D219).
  {
    re: /\b[a-z0-9-]{2,}\s*(\(|\[)?\s*dot\s*(\)|\])?\s*(com|net|org|co|io|shop|store)\b/i,
    weight: 2,
  },
  // Weaker on their own.
  { re: PHONE, weight: 1 },
  { re: /\b\d{1,2}\s?%\s?off\b|\bbogo\b|\bbuy one,? get one\b/i, weight: 1 },
  { re: /\$\s?\d/, weight: 1 },
  { re: /\bfollow (us|me)\b|\b(instagram|insta|ig|tiktok|facebook|fb)\s*[:@]/i, weight: 1 },
  {
    re: /\b(free (delivery|shipping|estimate|consultation)|limited time|while supplies last|call now|now hiring)\b/i,
    weight: 1,
  },
  {
    re: /\b(our|my) (shop|store|business|restaurant|salon|bakery|truck|menu|prices|services)\b/i,
    weight: 1,
  },
];

/** How ad-like a text is (the sum of the signals it has; each counts once). */
export function promoScore(text: string): number {
  return SIGNALS.reduce((n, s) => n + (s.re.test(text) ? s.weight : 0), 0);
}

/** What the author reads when a post waits for review because it looks like an ad. */
export const PROMO_NUDGE =
  'Thanks. This looks like an ad, so a moderator will check it before others see it. Own a business? Advertise the right way: run it on JaxSide for Business, where you post as “The Owner” on your place’s page and can run ads (the first month is free).';
