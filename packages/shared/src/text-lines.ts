/**
 * D262 (hub, Kenny's ask): ad text and event descriptions have at most 5 typed lines, so nobody
 * fills a card with line breaks. The website's editors stop at 5; the schemas refuse more.
 */
export const MAX_TYPED_LINES = 5;

/** How many lines someone typed (Enter starts a new one; wrapping doesn't count). */
export const typedLines = (text: string) => text.split(/\r\n|\r|\n/).length;

/**
 * For text saved before the rule: keeps the first `max` lines and joins the rest onto the last
 * one with spaces, so nothing is lost but it never runs past `max` lines of breaks.
 */
export function fitLines(text: string, max = MAX_TYPED_LINES): string {
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.length <= max) return text;
  const head = lines.slice(0, max - 1);
  const tail = lines
    .slice(max - 1)
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ');
  return [...head, tail].join('\n');
}
