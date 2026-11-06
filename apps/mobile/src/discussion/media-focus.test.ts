import { describe, expect, it, vi } from 'vitest';
import { claimMedia, stopMedia, stopMediaNotIn } from './media-focus';

describe('media focus (D203)', () => {
  it('starting a second player stops the first', () => {
    const a = vi.fn();
    const b = vi.fn();
    claimMedia('p1', a);
    claimMedia('p2', b);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    stopMedia();
  });
  it('scrolling the playing post out of view stops it; staying in view does not', () => {
    const a = vi.fn();
    claimMedia('p1', a);
    stopMediaNotIn(new Set(['p1', 'p2']));
    expect(a).not.toHaveBeenCalled();
    stopMediaNotIn(new Set(['p2']));
    expect(a).toHaveBeenCalledTimes(1);
  });
  it('a released player is not stopped later', () => {
    const a = vi.fn();
    const release = claimMedia('p1', a);
    release();
    stopMedia();
    expect(a).not.toHaveBeenCalled();
  });
});
