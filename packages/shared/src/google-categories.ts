/**
 * D225: a Google Business Profile's main category ("Coffee shop", "Barber shop") to the kind
 * of place JaxSide uses (`SUBMIT_CATEGORIES`), for "Add it from Google". Only a first guess:
 * the owner confirms or changes it before sending. Unknown categories give 'other'.
 * Checked in order, so more specific words come first.
 */
const RULES: [RegExp, string][] = [
  [/\b(coffee|espresso|caf[eé]|tea house)\b/i, 'cafe'],
  [/\b(bakery|bagel)\b/i, 'bakery'],
  [
    /\b(dessert|ice cream|frozen yogurt|donut|doughnut|cupcake|candy|chocolate|gelato)\b/i,
    'dessert',
  ],
  [/\b(fast food|hamburger|hot dog|chicken wings?|sandwich|sub shop|food court)\b/i, 'fast_food'],
  [/\b(night ?club|dance club|karaoke)\b/i, 'nightlife'],
  [/\b(bar|pub|brewery|brewpub|taproom|tavern|wine bar|cocktail|lounge|beer garden)\b/i, 'bar'],
  [
    /\b(restaurant|diner|grill|steak ?house|pizz\w*|taco|sushi|bbq|barbecue|bistro|eatery|kitchen|buffet|seafood|food truck)\b/i,
    'restaurant',
  ],
  [/\b(gym|fitness|yoga|pilates|crossfit|martial arts|boxing)\b/i, 'fitness'],
  [/\b(hotel|motel|inn|resort|bed (and|&) breakfast|hostel)\b/i, 'lodging'],
  [/\b(supermarket|grocery)\b/i, 'grocery'],
  [/\b(convenience store|corner store)\b/i, 'convenience'],
  [/\b(farmers'? market|flea market|market)\b/i, 'market'],
  [/\b(shopping mall|mall|outlet)\b/i, 'mall'],
  [/\b(car dealer|auto dealer|used car)\b/i, 'car_dealer'],
  [/\b(auto|car repair|car wash|tire|oil change|mechanic|body shop)\b/i, 'automotive'],
  [/\b(gas station|fuel)\b/i, 'gas_station'],
  [/\b(bank|credit union)\b/i, 'bank'],
  [/\b(pharmacy|drug ?store)\b/i, 'pharmacy'],
  [/\bpost office\b/i, 'post_office'],
  [/\bmuseum\b/i, 'museum'],
  [/\b(art gallery|gallery|art studio|theater|theatre)\b/i, 'arts'],
  [/\b(event venue|banquet|wedding venue|concert hall|amphitheater)\b/i, 'venue'],
  [/\b(bowling|arcade|escape room|cinema|movie theater|trampoline|amusement)\b/i, 'entertainment'],
  [/\bgolf\b/i, 'golf'],
  [/\b(marina|boat)\b/i, 'marina'],
  [/\b(church|chapel|cathedral)\b/i, 'church'],
  [/\bmosque\b/i, 'mosque'],
  [/\b(synagogue|temple)\b/i, 'synagogue'],
  [/\blibrary\b/i, 'library'],
  [/\b(store|shop|boutique|florist|bookstore)\b/i, 'shop'],
];

export function googleCategoryToKind(googleCategory: string | null | undefined): string {
  if (!googleCategory) return 'other';
  return RULES.find(([re]) => re.test(googleCategory))?.[1] ?? 'other';
}
