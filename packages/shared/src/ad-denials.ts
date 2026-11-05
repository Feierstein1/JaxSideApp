/**
 * D211: why JaxSide turns an ad down. The admin picks a broad reason, then a detailed one
 * (worded like the published ad rules, D207 / D208), and can add a note. The business sees
 * the result in plain words on its ad and in its bell; the code stays in the audit log.
 */

export interface AdDenialReason {
  code: string;
  /** Short, for the admin's list. */
  label: string;
  /** What the business is told (a full sentence). */
  text: string;
}

export interface AdDenialGroup {
  code: string;
  label: string;
  /** One line under the broad choice, so the admin knows what's inside. */
  hint: string;
  reasons: AdDenialReason[];
}

export const AD_DENIAL_GROUPS = [
  {
    code: 'PHOTOS',
    label: 'Photos aren’t real',
    hint: 'The ad photo rules: AI or not-real pictures (D207).',
    reasons: [
      {
        code: 'AI_FOOD',
        label: 'AI-made or AI-changed food or drink',
        text: 'Food and drink pictures must be real photos of what you serve, not made or changed with AI.',
      },
      {
        code: 'AI_PLACE',
        label: 'AI place, staff or customers that look real',
        text: 'Pictures of your place, staff or customers must be real photos, not AI images made to look real.',
      },
      {
        code: 'AI_SHOWY',
        label: 'Showy, obviously AI-made image',
        text: 'Showy, obviously AI-made images aren’t allowed. Keep any AI design subtle.',
      },
      {
        code: 'FAKE_REVIEWS',
        label: 'Made-up reviews, quotes or customers',
        text: 'Reviews, quotes and customers in an ad must be real.',
      },
    ],
  },
  {
    code: 'NEVER_ALLOWED',
    label: 'Never allowed',
    hint: 'Content no ad may have (D208).',
    reasons: [
      {
        code: 'EXPLICIT',
        label: 'Nudity, sexual or explicit',
        text: 'Ads can’t have nudity or sexual or explicit pictures or wording.',
      },
      {
        code: 'HATEFUL',
        label: 'Slurs, hateful images or wording',
        text: 'Ads can’t have slurs or hateful images, symbols or wording, or put down a group of people.',
      },
      {
        code: 'DRUGS',
        label: 'Illegal drugs or paraphernalia',
        text: 'Ads can’t show illegal drugs or drug paraphernalia, or make drug use look good.',
      },
      {
        code: 'ADULTS_UNMARKED',
        label: '21+ content not marked 21+',
        text: 'Alcohol, tobacco, vaping and other adult-only offers must be marked “Adults only (21+)” and not aimed at people under 21.',
      },
      {
        code: 'WEAPONS_VIOLENCE',
        label: 'Weapons, violence or gore',
        text: 'Ads can’t sell weapons or show violence or gore.',
      },
      {
        code: 'MISLEADING_OFFER',
        label: 'Untrue or misleading offer',
        text: 'Prices, discounts and “free” deals must be ones you’ll honor, with no fake countdowns.',
      },
      {
        code: 'NOT_YOURS',
        label: 'Others’ photos, logos or private info',
        text: 'Ads can only use photos, logos and brands you have the right to use, and no one’s private information.',
      },
      {
        code: 'ATTACKS',
        label: 'Attacks others by name',
        text: 'Ads can’t attack other businesses or people by name.',
      },
      {
        code: 'GAMBLING_PAYMENT',
        label: 'Gambling, get-rich-quick, or outside payment',
        text: 'Ads can’t offer gambling or get-rich-quick deals, or ask for payment or personal details outside your place.',
      },
    ],
  },
  {
    code: 'QUALITY',
    label: 'Quality or mistakes',
    hint: 'Nothing against the rules, but it needs fixing before it runs.',
    reasons: [
      {
        code: 'PICTURE_QUALITY',
        label: 'Picture unclear or poor quality',
        text: 'The picture is unclear or low quality. Please use a sharper one.',
      },
      {
        code: 'TEXT_MISTAKES',
        label: 'Spelling or grammar mistakes',
        text: 'The ad’s text has mistakes. Please check the spelling and wording.',
      },
      {
        code: 'WRONG_INFO',
        label: 'Details don’t match the place',
        text: 'Some details (hours, prices or what’s offered) don’t match your place.',
      },
      {
        code: 'UNCLEAR_OFFER',
        label: 'Hard to tell what’s offered',
        text: 'It’s hard to tell what the ad is offering. Please make the offer clear.',
      },
    ],
  },
  {
    code: 'OTHER',
    label: 'Something else',
    hint: 'Write what needs to change.',
    reasons: [{ code: 'OTHER', label: 'Something else (write a note)', text: '' }],
  },
] as const satisfies readonly AdDenialGroup[];

export type AdDenialCode = (typeof AD_DENIAL_GROUPS)[number]['reasons'][number]['code'];

export const AD_DENIAL_CODES = AD_DENIAL_GROUPS.flatMap((g) => g.reasons.map((r) => r.code)) as [
  AdDenialCode,
  ...AdDenialCode[],
];

/** The broad group and detailed reason for a code. */
export function adDenial(code: string): { group: AdDenialGroup; reason: AdDenialReason } | null {
  for (const group of AD_DENIAL_GROUPS) {
    const reason = (group.reasons as readonly AdDenialReason[]).find((r) => r.code === code);
    if (reason) return { group, reason };
  }
  return null;
}

/** What the business reads: "Never allowed: … Note: …" (at most 500 characters). */
/** D213: denials for the photo rules (D207) can come with a strike (D191). */
export const PHOTO_DENIAL_CODES: readonly string[] =
  AD_DENIAL_GROUPS.find((g) => g.code === 'PHOTOS')?.reasons.map((r) => r.code) ?? [];

export function adDenialMessage(code: string, note?: string | null): string {
  const d = adDenial(code);
  const extra = note?.trim();
  const parts =
    !d || d.group.code === 'OTHER'
      ? [extra ?? '']
      : [`${d.group.label}: ${d.reason.text}`, extra ? `Note: ${extra}` : ''];
  return parts.filter(Boolean).join(' ').slice(0, 500);
}
