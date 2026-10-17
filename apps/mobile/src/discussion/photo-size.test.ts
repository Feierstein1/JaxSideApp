import { describe, expect, it } from 'vitest';
import { shrinkTo, UPLOAD_MAX_SIDE } from './photo-size';

describe('photo shrink before upload (D73)', () => {
  it('shrinks the longest side to the limit, keeping the shape', () => {
    expect(shrinkTo(4000, 3000)).toEqual({ width: UPLOAD_MAX_SIDE });
    expect(shrinkTo(3000, 4000)).toEqual({ height: UPLOAD_MAX_SIDE });
    expect(shrinkTo(8160, 6120)).toEqual({ width: UPLOAD_MAX_SIDE }); // 50 MP phone
  });
  it('leaves small photos alone', () => {
    expect(shrinkTo(1200, 900)).toBeNull();
    expect(shrinkTo(UPLOAD_MAX_SIDE, 100)).toBeNull();
  });
});
