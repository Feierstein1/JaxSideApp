/**
 * D207 / D208: the ad rules, in one place for the owner website (its "Ad rules" page) and the
 * admin portal (shown beside an ad being reviewed). Wording from the website's `adRules`.
 */
export const AD_RULES = {
  intro:
    'Show what you really sell, and keep it fit for everyone in Jacksonville. JaxSide checks every ad against these rules before it runs.',
  dos: [
    'Use real photos of your own food, drinks, place and team.',
    'Edit photos the normal way: brightness, cropping, removing a background, small touch-ups.',
    'Use designed graphics for text, logos, patterns or plain backgrounds, even if your design app used AI to help.',
    'Use AI to help write your ad text, as long as everything it says is true.',
    'Tick “Adults only (21+)” for alcohol, tobacco, vaping, bars’ late-night events or anything else only for adults.',
  ],
  photos: [
    'No AI-made or AI-changed pictures of food or drinks. Food photos must be real photos of what you serve.',
    'No AI pictures of your place, staff or customers that look like real photos (a made-up dining room, crowd or happy diners).',
    'No showy, obviously AI-made images. Keep any AI design subtle.',
    'No made-up reviews, quotes or customers.',
  ],
  neverAllowed: [
    'Nudity, sexual or explicit images or wording.',
    'Slurs, racist or hateful images, symbols or wording, or anything that puts down a group of people.',
    'Illegal drugs, drug paraphernalia, or making drug use look good.',
    'Adult-only content (alcohol, tobacco, vaping) without ticking “Adults only (21+)”, or aimed at people under 21.',
    'Weapons for sale, or violence and gore.',
    'Untrue or misleading offers: prices, discounts or “free” deals you won’t honor, or fake countdowns.',
    'Other people’s photos, logos or brands you don’t have the right to use, or anyone’s private information.',
    'Attacks on other businesses or people by name.',
    'Gambling, get-rich-quick offers, or anything that asks for payment or personal details outside your place.',
  ],
  info: [
    'An ad that breaks these rules is sent back with the reason, so you can fix it and send it again.',
    'Breaking them again and again can count as a strike against your login.',
  ],
} as const;
