import { describe, expect, it } from 'vitest';
import { googleCategoryToKind } from './google-categories';
import { SUBMIT_CATEGORIES } from './schemas/submission';

// D225: Google's main category → our kind of place (a first guess the owner confirms).

describe('googleCategoryToKind', () => {
  it('maps common Google categories', () => {
    expect(googleCategoryToKind('Coffee shop')).toBe('cafe');
    expect(googleCategoryToKind('Mexican restaurant')).toBe('restaurant');
    expect(googleCategoryToKind('Sports bar')).toBe('bar');
    expect(googleCategoryToKind('Ice cream shop')).toBe('dessert');
    expect(googleCategoryToKind('Auto repair shop')).toBe('automotive');
    expect(googleCategoryToKind('Hotel')).toBe('lodging');
    expect(googleCategoryToKind('Pizza restaurant')).toBe('restaurant');
    expect(googleCategoryToKind('Pizzeria')).toBe('restaurant');
  });

  it('unknown or missing gives other, and every answer is a kind we have', () => {
    expect(googleCategoryToKind('Notary public')).toBe('other');
    expect(googleCategoryToKind(null)).toBe('other');
    for (const c of ['Coffee shop', 'Barber shop', 'Gym', 'Church', 'Bank', 'Marina', 'Museum']) {
      expect((SUBMIT_CATEGORIES as readonly string[]).includes(googleCategoryToKind(c))).toBe(true);
    }
  });
});
