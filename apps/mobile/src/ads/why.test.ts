import { describe, expect, it } from 'vitest';
import { adWhyText } from './why';

const base = {
  reach: 'citywide' as const,
  nearMeters: null,
  zip: null,
  boosted: false,
  favorite: false,
  interested: false,
};

describe('Why am I seeing this ad? (D276)', () => {
  it('says how the business aimed it, and what JaxSide never uses', () => {
    const t = adWhyText(base, 'Bold Bean');
    expect(t).toContain('Bold Bean chose to show this ad across Jacksonville.');
    expect(t).toContain('advertisers never learn who you are');
  });

  it('names the ZIP code, the distance, a boost and the reader’s own choices', () => {
    expect(adWhyText({ ...base, reach: 'zip', zip: '32204' }, 'Al’s')).toContain('ZIP code 32204');
    expect(adWhyText({ ...base, reach: 'near', nearMeters: 1609 }, 'Al’s')).toContain(
      'within about',
    );
    expect(adWhyText({ ...base, boosted: true }, 'Al’s')).toContain('boosted');
    const mine = adWhyText({ ...base, favorite: true, interested: true }, 'Al’s');
    expect(mine).toContain('You favorited this place');
    expect(mine).toContain('marked this business’s ads Interested');
  });
});
