/** D127: the art deco shapes' outlines (pure, so they can be tested without a phone). */

export type DecoShape = 'chamfer' | 'chamferTop' | 'arrow';

/** Corner cut for clipped boxes, and how far an arrow's point sticks out. */
export const DECO = { cut: 10, cutSmall: 6, point: 11 } as const;

export function decoPath(shape: DecoShape, w: number, h: number, cut: number, inset = 0) {
  const i = inset;
  const c = Math.min(cut, w / 2, h / 2);
  if (shape === 'arrow') {
    const a = Math.min(cut, h / 2);
    return `M${a + i} ${i} H${w - a - i} L${w - i} ${h / 2} L${w - a - i} ${h - i} H${a + i} L${i} ${h / 2} Z`;
  }
  if (shape === 'chamferTop') {
    return `M${c + i} ${i} H${w - c - i} L${w - i} ${c + i} V${h - i} H${i} V${c + i} Z`;
  }
  return `M${c + i} ${i} H${w - c - i} L${w - i} ${c + i} V${h - c - i} L${w - c - i} ${h - i} H${c + i} L${i} ${h - c - i} V${c + i} Z`;
}
