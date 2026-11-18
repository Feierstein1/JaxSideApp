import { describe, expect, it } from 'vitest';
import { pictureKind } from './events';

describe('pictureKind (D265)', () => {
  it('calls a clearly tall picture a flyer and everything else a photo', () => {
    expect(pictureKind(1080, 1350)).toBe('flyer');
    expect(pictureKind(1000, 1200)).toBe('flyer');
    expect(pictureKind(1000, 1000)).toBe('photo');
    expect(pictureKind(1600, 900)).toBe('photo');
    expect(pictureKind(1000, 1100)).toBe('photo');
    expect(pictureKind(0, 0)).toBe('photo');
  });
});
