import { describe, expect, it } from 'vitest';
import { adDraftSchema } from './schemas/ads';
import { fitLines, typedLines } from './text-lines';

// D262 (hub): at most 5 typed lines in ad text and event descriptions.
describe('typed lines', () => {
  it('counts Enter, not wrapping', () => {
    expect(typedLines('one line that is very long and would wrap on a phone')).toBe(1);
    expect(typedLines('a\nb\r\nc')).toBe(3);
  });

  it('folds older text past 5 lines onto the fifth, losing nothing', () => {
    expect(fitLines('1\n2\n3\n4\n5\n6\n\n7')).toBe('1\n2\n3\n4\n5 6 7');
    expect(fitLines('short\ntext')).toBe('short\ntext');
  });

  it('ad text refuses a sixth line', () => {
    const ad = (body: string) =>
      adDraftSchema.safeParse({
        placeId: '01a1936d-1930-746f-9bf1-cc48335965d2',
        template: 'POST',
        headline: 'Half-price wings',
        body,
      }).success;
    expect(ad('a\nb\nc\nd\ne')).toBe(true);
    expect(ad('a\nb\nc\nd\ne\nf')).toBe(false);
  });
});
