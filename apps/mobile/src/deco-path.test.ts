import { describe, expect, it } from 'vitest';
import { decoPath } from './deco-path';

/** The corner points of an SVG path made of M/H/V/L commands. */
function points(d: string) {
  const out: [number, number][] = [];
  let x = 0;
  let y = 0;
  for (const [, cmd, args] of d.matchAll(/([MHVLZ])([^MHVLZ]*)/g)) {
    const n = args!.trim().split(/\s+/).filter(Boolean).map(Number);
    if (cmd === 'M' || cmd === 'L') [x, y] = [n[0]!, n[1]!];
    else if (cmd === 'H') x = n[0]!;
    else if (cmd === 'V') y = n[0]!;
    else continue;
    out.push([x, y]);
  }
  return out;
}

describe('art deco shapes (D127)', () => {
  it('chamfer: eight points, every corner cut, inside the box', () => {
    const p = points(decoPath('chamfer', 200, 60, 10));
    expect(p).toHaveLength(8);
    expect(p).toContainEqual([10, 0]);
    expect(p).toContainEqual([200, 10]);
    expect(p).toContainEqual([190, 60]);
    expect(p).toContainEqual([0, 50]);
    for (const [x, y] of p) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(200);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(60);
    }
  });

  it('chamferTop: only the top corners are cut', () => {
    const p = points(decoPath('chamferTop', 300, 120, 14));
    expect(p).toContainEqual([300, 120]);
    expect(p).toContainEqual([0, 120]);
    expect(p).toContainEqual([14, 0]);
  });

  it('arrow: pointed ends at mid-height', () => {
    const p = points(decoPath('arrow', 120, 36, 11));
    expect(p).toContainEqual([120, 18]);
    expect(p).toContainEqual([0, 18]);
    expect(p).toContainEqual([11, 0]);
  });

  it('never cuts more than half the box (small or squashed shapes stay valid)', () => {
    const p = points(decoPath('chamfer', 12, 8, 10));
    for (const [x, y] of p) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(12);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(8);
    }
    const a = points(decoPath('arrow', 100, 20, 30));
    expect(a).toContainEqual([10, 0]); // point limited to half the height
  });

  it('a stroke inset keeps the outline inside the box', () => {
    const p = points(decoPath('chamfer', 100, 40, 8, 1));
    for (const [x, y] of p) {
      expect(x).toBeGreaterThanOrEqual(1);
      expect(x).toBeLessThanOrEqual(99);
      expect(y).toBeGreaterThanOrEqual(1);
      expect(y).toBeLessThanOrEqual(39);
    }
  });
});
